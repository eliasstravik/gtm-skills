import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { stripNul, type Executor } from "../db";
import { profileAttempts, profileRuns, profileWork } from "../schema/ledger";
import { sanitize, transaction } from "./store";

// The tables are defined in lib/schema/ledger.ts. Every transaction here starts with the write lock (store.transaction),
// so claim, reserve and settle never interleave; the two partial unique indexes stay as the backstop.
const micros = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0 || usd > 100000)
    throw new Error("Invalid spending limit");
  return Math.ceil(usd * 1e6);
};
const LEASE_MS = 15 * 60 * 1000;
const UNSETTLED = ["reserved", "dispatched", "uncertain"];
const leaseEnd = () => new Date(Date.now() + LEASE_MS);
export type RunLease = { id: string; owner: string };
export type WorkState =
  | "pending"
  | "done"
  | "reused"
  | "no_match"
  | "failed"
  | "unresolved"
  | "ambiguous"
  | "budget_deferred"
  | "uncertain";
async function assertLease(tx: Executor, lease: RunLease) {
  const [row] = await tx.select().from(profileRuns).where(eq(profileRuns.id, lease.id));
  if (
    !row ||
    row.owner !== lease.owner ||
    row.state !== "running" ||
    row.lease_until.getTime() < Date.now()
  )
    throw new Error("Run is cancelled or another worker owns it");
  await tx.update(profileRuns).set({ lease_until: leaseEnd() }).where(eq(profileRuns.id, lease.id));
  return row;
}
/** A stale run must be explicitly resumed; a fresh run never steals its lock. */
export async function beginRun(
  client: Executor,
  options: {
    id: string;
    owner: string;
    workflowId: string;
    budgetUsd: number;
    input: unknown[];
    omitted: number;
    resume?: boolean;
  },
) {
  return transaction(client, async (tx) => {
    const [active] = await tx.select().from(profileRuns).where(eq(profileRuns.state, "running"));
    if (
      active &&
      (active.id !== options.id ||
        (active.owner !== options.owner &&
          active.lease_until.getTime() >= Date.now()))
    )
      return { status: "already_running" as const, runId: active.id };
    const [existing] = await tx.select().from(profileRuns).where(eq(profileRuns.id, options.id));
    if (existing) {
      if (existing.workflow_id !== options.workflowId)
        throw new Error("Run belongs to another workflow");
      if (existing.owner !== options.owner && !options.resume)
        throw new Error("Explicit resume required");
      if (existing.state === "complete")
        return { status: "complete" as const, runId: options.id };
      await tx.update(profileRuns).set({ owner: options.owner, state: "running", lease_until: leaseEnd() }).where(eq(profileRuns.id, options.id));
    } else {
      if (options.resume) throw new Error("Unknown saved run");
      await tx.insert(profileRuns).values({
        id: options.id,
        workflow_id: options.workflowId,
        owner: options.owner,
        lease_until: leaseEnd(),
        state: "running",
        budget_micro: micros(options.budgetUsd),
        input_json: stripNul(options.input),
        omitted: options.omitted,
        created_at: new Date(),
      });
    }
    return {
      status: "running" as const,
      runId: options.id,
      input: (existing?.input_json ?? options.input) as any[],
    };
  });
}
export async function saveWork(
  client: Executor,
  lease: RunLease,
  phase: "people" | "companies",
  keys: string[],
) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    const unique = [...new Set(keys)];
    if (unique.length)
      await tx.insert(profileWork).values(unique.map((key) => ({ run_id: lease.id, phase, entity_key: key }))).onConflictDoNothing();
    if (phase === "companies")
      await tx
        .update(profileRuns)
        .set({ companies_json: sql`COALESCE(${profileRuns.companies_json}, ${JSON.stringify(keys)}::jsonb)` })
        .where(eq(profileRuns.id, lease.id));
  });
}
export async function markWork(
  client: Executor,
  lease: RunLease,
  phase: string,
  key: string,
  state: WorkState,
) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    await tx.update(profileWork).set({ state }).where(and(eq(profileWork.run_id, lease.id), eq(profileWork.phase, phase), eq(profileWork.entity_key, key)));
  });
}
export async function reserve(
  client: Executor,
  lease: RunLease,
  entityKey: string,
  operation: string,
  maximumUsd: number | null,
) {
  return transaction(client, async (tx) => {
    const run = await assertLease(tx, lease);
    const [existing] = await tx
      .select()
      .from(profileAttempts)
      .where(and(eq(profileAttempts.entity_key, entityKey), eq(profileAttempts.operation, operation), or(eq(profileAttempts.run_id, lease.id), inArray(profileAttempts.state, UNSETTLED))))
      .orderBy(desc(profileAttempts.created_at))
      .limit(1);
    if (existing) return { status: "existing" as const, attempt: existing };
    if (maximumUsd === null) return { status: "unknown_price" as const };
    const amount = micros(maximumUsd);
    if (run.spent_micro + run.reserved_micro + amount > run.budget_micro)
      return { status: "budget_deferred" as const };
    const id = randomUUID();
    await tx.insert(profileAttempts).values({ id, run_id: lease.id, entity_key: entityKey, operation, state: "reserved", reserved_micro: amount, created_at: new Date() });
    await tx.update(profileRuns).set({ reserved_micro: sql`${profileRuns.reserved_micro} + ${amount}` }).where(eq(profileRuns.id, lease.id));
    return { status: "reserved" as const, id };
  });
}
/** Write before network dispatch. A crash after this point never authorizes another POST. */
export async function dispatch(client: Executor, lease: RunLease, id: string) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    const changed = await tx
      .update(profileAttempts)
      .set({ state: "dispatched" })
      .where(and(eq(profileAttempts.id, id), eq(profileAttempts.run_id, lease.id), eq(profileAttempts.state, "reserved")))
      .returning({ id: profileAttempts.id });
    return changed.length === 1;
  });
}
export async function saveJob(client: Executor, id: string, jobId: string) {
  await client.update(profileAttempts).set({ job_id: jobId }).where(and(eq(profileAttempts.id, id), inArray(profileAttempts.state, ["dispatched", "uncertain"])));
}
export async function uncertain(client: Executor, id: string) {
  await client.update(profileAttempts).set({ state: "uncertain" }).where(and(eq(profileAttempts.id, id), ne(profileAttempts.state, "settled")));
}
/** Response and accounting commit together; profile application can safely replay later. */
export async function settle(
  client: Executor,
  id: string,
  costUsd: number | null,
  response: unknown,
) {
  return transaction(client, async (tx) => {
    const [attempt] = await tx.select().from(profileAttempts).where(eq(profileAttempts.id, id));
    if (!attempt) throw new Error("Unknown attempt");
    if (attempt.state === "settled") return;
    const saved = stripNul(sanitize(response));
    if (costUsd === null) {
      await tx.update(profileAttempts).set({ state: "uncertain", response_json: saved }).where(eq(profileAttempts.id, id));
      return;
    }
    const cost = micros(costUsd);
    if (cost > attempt.reserved_micro)
      throw new Error(
        "Provider charge exceeded verified maximum; stop and reconcile",
      );
    await tx.update(profileAttempts).set({ state: "settled", cost_micro: cost, response_json: saved }).where(eq(profileAttempts.id, id));
    await tx
      .update(profileRuns)
      .set({ spent_micro: sql`${profileRuns.spent_micro} + ${cost}`, reserved_micro: sql`${profileRuns.reserved_micro} - ${attempt.reserved_micro}` })
      .where(eq(profileRuns.id, attempt.run_id));
  });
}
export async function cancelRun(client: Executor, runId: string) {
  await client.update(profileRuns).set({ state: "cancelled" }).where(and(or(eq(profileRuns.id, runId), eq(profileRuns.owner, runId)), eq(profileRuns.state, "running")));
}
export async function runSummary(client: Executor, runId: string) {
  const [run] = await client.select().from(profileRuns).where(eq(profileRuns.id, runId));
  if (!run) throw new Error("Unknown run");
  const work = await client
    .select({ phase: profileWork.phase, state: profileWork.state, count: sql<number>`count(*)::int` })
    .from(profileWork)
    .where(eq(profileWork.run_id, runId))
    .groupBy(profileWork.phase, profileWork.state);
  return {
    runId,
    state: run.state,
    omitted: run.omitted,
    spentUsd: run.spent_micro / 1e6,
    uncertainSpendUsd: run.reserved_micro / 1e6,
    outcomes: work,
  };
}
export async function finishRun(client: Executor, lease: RunLease) {
  return transaction(client, async (tx) => {
    const run = await assertLease(tx, lease);
    const [open] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(profileWork)
      .where(and(eq(profileWork.run_id, lease.id), sql`${profileWork.state} NOT IN ('done','reused')`));
    await tx.update(profileRuns).set({ state: open.count || run.reserved_micro ? "partial" : "complete" }).where(eq(profileRuns.id, lease.id));
  });
}
