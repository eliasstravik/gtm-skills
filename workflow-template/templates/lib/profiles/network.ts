import { createHash } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { stripNul, type Executor } from "../db";
import { profileAttempts, profileInputs, profileRuns, profileWork } from "../schema/ledger";
import {
  applyEvidence,
  canonicalUrl,
  currentCompanies,
  getProfile,
  isFresh,
  markUnresolved,
  recentMiss,
  resolveIdentity,
  transaction,
  type Source,
} from "./store";
import {
  beginRun,
  markWork,
  renewLease,
  saveWork,
  settle,
  type RunLease,
  type WorkState,
} from "./ledger";
import type { LookupResult } from "./provider";
import { provider as networkProvider, type ProviderName } from "./providers";
import { identityFields } from "./identifiers.mjs";

export type NetworkInput = {
  rows?: Record<string, unknown>[];
  maxRows?: number;
  maxPeople?: number;
  maxSpendUsd?: number;
  refresh?: boolean;
  freshForDays?: number;
  sourceId?: string;
  networkOwner?: string;
  networkKind?: string;
  resumeRunId?: string;
  /** Which enrichment service does the lookups; monid when unset. */
  provider?: ProviderName;
  /** Request pacing for providers that need it (Blitz); the adapter's default when unset. */
  requestsPerSecond?: number;
};
export type NetworkPerson = {
  key: string;
  personKey?: string;
  url?: string;
  email?: string;
  source: Source;
  original: Record<string, unknown>;
};
/** Workers of one chunk: the pool has room for this many plus readers (lib/db.ts). */
export const DEFAULT_WORKERS = 12;
const PREPARE_WORKERS = 8;
const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
export function normalizeInput(
  rows: Record<string, unknown>[],
  workflowId: string,
  input: NetworkInput,
): NetworkPerson[] {
  const found = new Map<string, NetworkPerson>();
  for (const row of rows) {
    const suppliedUrl = text(
      row.profile_url ?? row.linkedin_url ?? row.url ?? row.URL,
    );
    const url = suppliedUrl
      ? (canonicalUrl(suppliedUrl, "people") ?? undefined)
      : undefined;
    const email = text(row.email ?? row["Email Address"])?.toLowerCase();
    const key =
      url ??
      email ??
      text(row.key) ??
      createHash("sha256").update(JSON.stringify(row)).digest("hex");
    const sourceId = input.sourceId ?? "network-import";
    const rowId = text(row.key) ?? key;
    const now = new Date().toISOString();
    if (!found.has(key))
      found.set(key, {
        key,
        url,
        email,
        original: row,
        source: {
          workflow_id: workflowId,
          source_id: sourceId,
          source_row_id: rowId,
          network_owner: input.networkOwner,
          network_kind: input.networkKind,
          connected_on: text(row.connected_on ?? row["Connected On"]),
          first_observed_at: now,
          last_observed_at: now,
        },
      });
  }
  return [...found.values()];
}
const inputOf = (workflowId: string, person: NetworkPerson) =>
  and(eq(profileInputs.workflow_id, workflowId), eq(profileInputs.source_id, person.source.source_id), eq(profileInputs.row_id, person.source.source_row_id));
/** Runs fn over items with a fixed number of workers; the first failure rejects, as Promise.all does. */
export async function eachWith<T>(items: T[], workers: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(workers, items.length)) }, worker));
}
export async function prepareNetwork(
  client: Executor,
  workflowId: string,
  owner: string,
  input: NetworkInput,
) {
  const limit = input.maxPeople ?? input.maxRows ?? 200,
    budget = input.maxSpendUsd ?? 20;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    !Number.isFinite(budget) ||
    budget < 0
  )
    throw new Error("Invalid people or spending limit");
  if (
    input.freshForDays !== undefined &&
    (!Number.isFinite(input.freshForDays) || input.freshForDays < 0)
  )
    throw new Error("Invalid freshness interval");
  let people = normalizeInput(input.rows ?? [], workflowId, input);
  if (!people.length && !input.resumeRunId) {
    const saved = await client
      .select({ input_json: profileInputs.input_json })
      .from(profileInputs)
      .where(eq(profileInputs.workflow_id, workflowId))
      .orderBy(asc(profileInputs.first_observed_at), asc(profileInputs.source_id), asc(profileInputs.row_id));
    const distinct = new Map<string, NetworkPerson>();
    for (const row of saved) {
      const person = row.input_json as NetworkPerson;
      distinct.set(person.key, person);
    }
    people = [...distinct.values()];
  }
  const lease = { id: input.resumeRunId ?? owner, owner };
  const begin = await beginRun(client, {
    ...lease,
    workflowId,
    budgetUsd: budget,
    input: people.slice(0, limit),
    omitted: Math.max(0, people.length - limit),
    resume: Boolean(input.resumeRunId),
  });
  if (begin.status !== "running")
    return {
      status: begin.status,
      runId: begin.runId,
      lease,
      people: [] as NetworkPerson[],
    };
  people = begin.input;
  // Each person is its own record and identifier, so admission runs a few at a time.
  await eachWith(people, PREPARE_WORKERS, async (person) => {
    if (person.url) {
      const resolved = await resolveIdentity(
        client,
        "people",
        { linkedin_url: person.url },
        person.source,
      );
      if (resolved.status === "resolved")
        person.personKey = resolved.profile.key;
    }
    const [previous] = await client.select({ person_key: profileInputs.person_key }).from(profileInputs).where(inputOf(workflowId, person));
    if (!person.personKey && previous?.person_key)
      person.personKey = previous.person_key;
    await client
      .insert(profileInputs)
      .values({
        workflow_id: workflowId,
        source_id: person.source.source_id,
        row_id: person.source.source_row_id,
        input_json: stripNul(person),
        person_key: person.personKey ?? null,
        first_observed_at: new Date(person.source.first_observed_at),
        last_observed_at: new Date(person.source.last_observed_at),
      })
      .onConflictDoUpdate({
        target: [profileInputs.workflow_id, profileInputs.source_id, profileInputs.row_id],
        set: {
          input_json: sql`excluded.input_json`,
          person_key: sql`COALESCE(excluded.person_key, ${profileInputs.person_key})`,
          last_observed_at: sql`excluded.last_observed_at`,
        },
      });
  });
  await saveWork(
    client,
    lease,
    "people",
    people.map((p) => p.key),
  );
  return { status: "running" as const, runId: lease.id, lease, people };
}
/** The saved person keys of these inputs, read in batches. */
async function personKeysOf(client: Executor, people: NetworkPerson[]) {
  const keys: string[] = [];
  for (let i = 0; i < people.length; i += 500) {
    const batch = people.slice(i, i + 500);
    const rows = await client
      .select({ person_key: profileInputs.person_key, source_id: profileInputs.source_id, row_id: profileInputs.row_id, workflow_id: profileInputs.workflow_id })
      .from(profileInputs)
      .where(or(...batch.map((person) => inputOf(person.source.workflow_id, person))));
    const byRow = new Map(rows.map((row) => [`${row.workflow_id}\n${row.source_id}\n${row.row_id}`, row.person_key]));
    for (const person of batch) {
      const key = byRow.get(`${person.source.workflow_id}\n${person.source.source_id}\n${person.source.source_row_id}`);
      if (key) keys.push(key);
    }
  }
  return keys;
}
export async function collectCompanies(
  client: Executor,
  lease: RunLease,
  people: NetworkPerson[],
) {
  const [run] = await client.select({ companies_json: profileRuns.companies_json }).from(profileRuns).where(eq(profileRuns.id, lease.id));
  const current = await currentCompanies(client, await personKeysOf(client, people));
  const selected = (run?.companies_json as string[] | null) ?? current.keys;
  await saveWork(client, lease, "companies", selected);
  return { ...current, keys: selected };
}
export async function beginItem(
  client: Executor,
  lease: RunLease,
  phase: "people" | "companies",
  item: NetworkPerson | string,
  input: NetworkInput,
  apiKey: string,
): Promise<LookupResult | { state: "reused" | "unresolved" }> {
  const person = typeof item === "string" ? undefined : item;
  const key = typeof item === "string" ? item : item.key;
  const [done] = await client
    .select({ state: profileWork.state })
    .from(profileWork)
    .where(and(eq(profileWork.run_id, lease.id), eq(profileWork.phase, phase), eq(profileWork.entity_key, key)));
  if (
    done &&
    ["done", "reused", "no_match", "ambiguous", "failed"].includes(done.state)
  )
    return { state: "reused" };
  const profileKey =
    person?.personKey ?? (phase === "companies" ? key : undefined);
  // What the lookup plan and the freshness check read: the columns the plan is made from, when the record was enriched, and the response envelopes without their payloads.
  const profile = profileKey
    ? await getProfile(client, phase, profileKey, { columns: [...(phase === "companies" ? ["domain", "name"] : []), "linkedin_url", "enriched_at", "responses_json"], payloads: false })
    : undefined;
  const adapter = networkProvider(input.provider);
  const plan = adapter.identity(phase, {
    url: person?.url,
    email: person?.email,
    domain: profile?.domain ?? undefined,
    linkedinUrl: profile?.linkedin_url ?? undefined,
    name: profile?.name ?? undefined,
  });
  if (plan.kind === "unresolved") {
    if (phase === "companies" && profileKey)
      await markUnresolved(client, "companies", profileKey, plan.reason);
    await markWork(client, lease, phase, key, "unresolved");
    return { state: "unresolved" };
  }
  const age = (input.freshForDays ?? 30) * 86400000;
  if (
    profile &&
    !input.refresh &&
    (isFresh(profile, plan.provider, plan.endpoint, plan.mode, [], age) ||
      recentMiss(profile, plan.provider, plan.endpoint, plan.mode, age))
  ) {
    await markWork(client, lease, phase, key, "reused");
    return { state: "reused" };
  }
  // The response is settled by acceptItem, in the same transaction as the evidence it becomes and the work it marks.
  const result = await adapter.lookup(
    client,
    lease,
    profile?.key ?? profileKey ?? `input:${person!.source.workflow_id}:${key}`,
    plan,
    apiKey,
    { requestsPerSecond: input.requestsPerSecond, deferSettle: true },
  );
  if (result.state === "unresolved") {
    if (phase === "companies" && profileKey)
      await markUnresolved(
        client,
        "companies",
        profileKey,
        "No LinkedIn company URL could be resolved from the domain",
      );
    await markWork(client, lease, phase, key, "unresolved");
    return { state: "unresolved" };
  }
  if (["uncertain", "budget_deferred", "unknown_price"].includes(result.state))
    await markWork(
      client,
      lease,
      phase,
      key,
      result.state === "unknown_price"
        ? "budget_deferred"
        : (result.state as WorkState),
    );
  return result;
}
/**
 * One transaction: the response is settled, applied as evidence and the work marked, and all of it commits together
 * or none of it does. A settled response the process loses before this point stays dispatched in the ledger and is
 * never bought again; the next run replays it as uncertain.
 */
export async function acceptItem(
  client: Executor,
  lease: RunLease,
  phase: "people" | "companies",
  item: NetworkPerson | string,
  result: Extract<LookupResult, { state: "ready" }>,
  input: NetworkInput = {},
) {
  const adapter = networkProvider(input.provider);
  const person = typeof item === "string" ? undefined : item,
    key = typeof item === "string" ? item : item.key;
  return transaction(client, async (tx) => {
    const cost = result.settlement ? result.settlement.costUsd : adapter.cost(result.run);
    // Use the original persisted observation time when a completed response replays.
    const createdAt = result.createdAt ?? (await tx.select({ created_at: profileAttempts.created_at }).from(profileAttempts).where(eq(profileAttempts.id, result.attemptId)))[0]?.created_at;
    const fetchedAt = (createdAt ?? new Date()).toISOString();
    let profileKey =
      person?.personKey ?? (phase === "companies" ? key : undefined);
    // The identity columns, for the lock names applyEvidence takes, and a company's domain, which the adapter normalizes against.
    const existing = profileKey
      ? await getProfile(tx, phase, profileKey, { columns: [...(phase === "companies" ? ["domain"] : []), ...identityFields[phase]] })
      : undefined;
    const e = adapter.normalize(phase, result.run, {
      fetchedAt,
      existingDomain: existing?.domain ?? "",
    });
    e.attempt_id = result.attemptId;
    if (
      result.run.status !== "COMPLETED" ||
      (result.run.providerResponse?.httpStatus ?? 200) >= 400
    )
      e.outcome =
        result.run.providerResponse?.httpStatus === 404 ? "no_match" : "failed";
    if (
      phase === "people" &&
      !profileKey &&
      e.outcome === "success" &&
      typeof e.fields.linkedin_url === "string"
    ) {
      const resolved = await resolveIdentity(
        tx,
        "people",
        { linkedin_url: e.fields.linkedin_url },
        person!.source,
      );
      if (resolved.status === "resolved") profileKey = resolved.profile.key;
    }
    let outcome: WorkState = e.outcome === "success" ? "done" : e.outcome;
    if (profileKey) {
      const profile = await applyEvidence(tx, phase, profileKey, e, { known: existing?.key === profileKey ? existing : undefined });
      if (profile.enrichment_status === "ambiguous") outcome = "ambiguous";
      if (person)
        await tx.update(profileInputs).set({ person_key: profile.key }).where(inputOf(person.source.workflow_id, person));
    } else if (e.outcome === "success") outcome = "unresolved";
    if (cost === null) outcome = "uncertain";
    // Last, so the run row's counters are locked only for these statements and the commit.
    if (result.settlement) await settle(tx, result.attemptId, result.settlement.costUsd, result.run);
    await markWork(tx, lease, phase, key, outcome);
  });
}
/**
 * One chunk of a phase: renews the lease once, then looks up and accepts the items with `workers` at a time. Paid
 * calls happen outside every transaction; the ledger, not the workflow engine, makes them durable, so a step running
 * this has maxRetries 0 and a rerun of the same chunk buys nothing twice.
 */
export async function enrichItems(
  client: Executor,
  lease: RunLease,
  phase: "people" | "companies",
  items: (NetworkPerson | string)[],
  input: NetworkInput,
  apiKey: string,
  options: { workers?: number } = {},
) {
  await renewLease(client, lease);
  await eachWith(items, options.workers ?? DEFAULT_WORKERS, async (item) => {
    const initial = await beginItem(client, lease, phase, item, input, apiKey);
    if (initial.state === "ready") await acceptItem(client, lease, phase, item, initial, input);
  });
}
