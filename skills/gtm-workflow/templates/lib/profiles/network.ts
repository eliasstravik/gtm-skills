import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  applyEvidence,
  canonicalUrl,
  currentCompanies,
  getProfile,
  isFresh,
  recentMiss,
  resolveIdentity,
  type Source,
} from "./store";
import {
  beginRun,
  markWork,
  saveWork,
  type RunLease,
  type WorkState,
} from "./ledger";
import { normalizeClay, normalizeContactOut } from "./normalize";
import { actualCost, startLookup, type LookupResult } from "./provider";

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
};
export type NetworkPerson = {
  key: string;
  personKey?: string;
  url?: string;
  email?: string;
  source: Source;
  original: Record<string, unknown>;
};
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
export async function prepareNetwork(
  client: Client,
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
    const saved = await client.execute({
      sql: "SELECT input_json FROM profile_inputs WHERE workflow_id = ? ORDER BY first_observed_at, source_id, row_id",
      args: [workflowId],
    });
    const distinct = new Map<string, NetworkPerson>();
    for (const row of saved.rows) {
      const person = JSON.parse(String(row.input_json)) as NetworkPerson;
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
  for (const person of people) {
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
    const previous = (
      await client.execute({
        sql: "SELECT person_key FROM profile_inputs WHERE workflow_id = ? AND source_id = ? AND row_id = ?",
        args: [
          workflowId,
          person.source.source_id,
          person.source.source_row_id,
        ],
      })
    ).rows[0];
    if (!person.personKey && previous?.person_key)
      person.personKey = String(previous.person_key);
    await client.execute({
      sql: "INSERT INTO profile_inputs(workflow_id,source_id,row_id,input_json,person_key,first_observed_at,last_observed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(workflow_id,source_id,row_id) DO UPDATE SET input_json=excluded.input_json,person_key=COALESCE(excluded.person_key,profile_inputs.person_key),last_observed_at=excluded.last_observed_at",
      args: [
        workflowId,
        person.source.source_id,
        person.source.source_row_id,
        JSON.stringify(person),
        person.personKey ?? null,
        person.source.first_observed_at,
        person.source.last_observed_at,
      ],
    });
  }
  await saveWork(
    client,
    lease,
    "people",
    people.map((p) => p.key),
  );
  return { status: "running" as const, runId: lease.id, lease, people };
}
export async function collectCompanies(
  client: Client,
  lease: RunLease,
  people: NetworkPerson[],
) {
  const run = (
    await client.execute({
      sql: "SELECT companies_json FROM profile_runs WHERE id = ?",
      args: [lease.id],
    })
  ).rows[0];
  const keys: string[] = [];
  for (const person of people) {
    const row = (
      await client.execute({
        sql: "SELECT person_key FROM profile_inputs WHERE workflow_id = ? AND source_id = ? AND row_id = ?",
        args: [
          person.source.workflow_id,
          person.source.source_id,
          person.source.source_row_id,
        ],
      })
    ).rows[0];
    if (row?.person_key) keys.push(String(row.person_key));
  }
  const current = await currentCompanies(client, keys);
  const selected = run?.companies_json
    ? (JSON.parse(String(run.companies_json)) as string[])
    : current.keys;
  await saveWork(client, lease, "companies", selected);
  return { ...current, keys: selected };
}
export async function beginItem(
  client: Client,
  lease: RunLease,
  phase: "people" | "companies",
  item: NetworkPerson | string,
  input: NetworkInput,
  apiKey: string,
): Promise<LookupResult | { state: "reused" | "unresolved" }> {
  const person = typeof item === "string" ? undefined : item;
  const key = typeof item === "string" ? item : item.key;
  const done = (
    await client.execute({
      sql: "SELECT state FROM profile_work WHERE run_id=? AND phase=? AND entity_key=?",
      args: [lease.id, phase, key],
    })
  ).rows[0];
  if (
    done &&
    ["done", "reused", "no_match", "ambiguous", "failed"].includes(
      String(done.state),
    )
  )
    return { state: "reused" };
  const profileKey =
    person?.personKey ?? (phase === "companies" ? key : undefined);
  const profile = profileKey
    ? await getProfile(client, phase, profileKey)
    : undefined;
  const provider = phase === "people" ? "clay" : "contactout",
    endpoint = phase === "people" ? "/enrichment/person" : "/v1/domain/enrich";
  const age = (input.freshForDays ?? 30) * 86400000;
  if (
    profile &&
    !input.refresh &&
    (isFresh(profile, provider, endpoint, "default", [], age) ||
      recentMiss(profile, provider, endpoint, "default", age))
  ) {
    await markWork(client, lease, phase, key, "reused");
    return { state: "reused" };
  }
  if (
    (phase === "people" && !person?.url && !person?.email) ||
    (phase === "companies" && !profile?.domain)
  ) {
    await markWork(client, lease, phase, key, "unresolved");
    return { state: "unresolved" };
  }
  const body =
    phase === "people"
      ? person!.url
        ? { "Professional Profile URL": person!.url }
        : { Email: person!.email }
      : { domains: [profile!.domain] };
  const result = await startLookup(
    client,
    lease,
    profile?.key ?? profileKey ?? `input:${person!.source.workflow_id}:${key}`,
    { provider, endpoint, body },
    apiKey,
  );
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
export async function acceptItem(
  client: Client,
  lease: RunLease,
  phase: "people" | "companies",
  item: NetworkPerson | string,
  result: Extract<LookupResult, { state: "ready" }>,
) {
  const person = typeof item === "string" ? undefined : item,
    key = typeof item === "string" ? item : item.key;
  // Use the original persisted observation time when a completed response replays.
  const attempt = (
    await client.execute({
      sql: "SELECT created_at FROM profile_attempts WHERE id=?",
      args: [result.attemptId],
    })
  ).rows[0];
  const fetchedAt = attempt
      ? String(attempt.created_at)
      : new Date().toISOString(),
    cost = actualCost(result.run);
  let profileKey =
    person?.personKey ?? (phase === "companies" ? key : undefined);
  const existing = profileKey
    ? await getProfile(client, phase, profileKey)
    : undefined;
  const e =
    phase === "people"
      ? normalizeClay(result.run, fetchedAt, cost)
      : normalizeContactOut(
          result.run,
          existing?.domain ?? "",
          fetchedAt,
          cost,
        );
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
      client,
      "people",
      { linkedin_url: e.fields.linkedin_url },
      person!.source,
    );
    if (resolved.status === "resolved") profileKey = resolved.profile.key;
  }
  let outcome: WorkState = e.outcome === "success" ? "done" : e.outcome;
  if (profileKey) {
    const profile = await applyEvidence(client, phase, profileKey, e);
    if (profile.enrichment_status === "ambiguous") outcome = "ambiguous";
    if (person)
      await client.execute({
        sql: "UPDATE profile_inputs SET person_key=? WHERE workflow_id=? AND source_id=? AND row_id=?",
        args: [
          profile.key,
          person.source.workflow_id,
          person.source.source_id,
          person.source.source_row_id,
        ],
      });
  } else if (e.outcome === "success") outcome = "unresolved";
  if (cost === null) outcome = "uncertain";
  await markWork(client, lease, phase, key, outcome);
}
