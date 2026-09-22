import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { lockNames, stripNul, type Executor } from "../db";
import { profileAttempts, profileRuns, profileWork } from "../schema/ledger";
import { sanitize, transaction } from "./store";

// The tables are defined in lib/schema/ledger.ts. A reservation is serialized on its (entity, operation) name, a run's
// counters on the run row, an attempt on its row; the two partial unique indexes stay as the backstop.
const micros = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0 || usd > 100000)
    throw new Error("Invalid spending limit");
  return Math.ceil(usd * 1e6);
};
/** Long enough for a chunk of work; the step that owns a chunk renews it once at the start (renewLease). */
const LEASE_MS = 30 * 60 * 1000;
const UNSETTLED = ["reserved", "dispatched", "uncertain"];
const leaseEnd = () => new Date(Date.now() + LEASE_MS);
const NOT_OWNED = "Run is cancelled or another worker owns it";
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
const owned = (lease: RunLease) => and(eq(profileRuns.id, lease.id), eq(profileRuns.owner, lease.owner), eq(profileRuns.state, "running"), sql`${profileRuns.lease_until} >= now()`);
/** The run is still this worker's: running, owned, lease unexpired. Once per chunk, not per write. */
async function assertOwned(client: Executor, lease: RunLease) {
  const [row] = await client.select().from(profileRuns).where(owned(lease));
  if (!row) throw new Error(NOT_OWNED);
  return row;
}
/** Extends the lease by a full period. Call at the start of every chunk of work; every write of the chunk then runs under it. */
export async function renewLease(client: Executor, lease: RunLease) {
  const changed = await client.update(profileRuns).set({ lease_until: leaseEnd() }).where(owned(lease)).returning({ id: profileRuns.id });
  if (changed.length !== 1) throw new Error(NOT_OWNED);
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
    // One name for every run start of the workspace: the single-flight rule is decided by reading, so starts are serial.
    await lockNames(tx, ["runs"]);
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
    await lockNames(tx, [`run:${lease.id}`]);
    await assertOwned(tx, lease);
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
/** One statement: the work row changes only while the run is still this worker's. Inside an accept transaction it is the last write, so a lost lease rolls the whole item back. */
export async function markWork(
  client: Executor,
  lease: RunLease,
  phase: string,
  key: string,
  state: WorkState,
) {
  const changed = await client
    .update(profileWork)
    .set({ state })
    .where(and(eq(profileWork.run_id, lease.id), eq(profileWork.phase, phase), eq(profileWork.entity_key, key), sql`EXISTS (SELECT 1 FROM ${profileRuns} WHERE ${owned(lease)})`))
    .returning({ key: profileWork.entity_key });
  // No row: either the run is no longer ours, or there was no such work row (nothing to mark, as before).
  if (!changed.length) await assertOwned(client, lease);
}
/**
 * One transaction: the price check, the budget check and the attempt row, committed before any network dispatch.
 * Serialized on the (entity, operation) name, so two workers cannot both reserve the same lookup; the budget is
 * checked and taken in one conditional update of the run row, so concurrent reservations cannot overspend it.
 */
async function reservation(
  client: Executor,
  lease: RunLease,
  entityKey: string,
  operation: string,
  maximumUsd: number | null,
  state: "reserved" | "dispatched",
) {
  return transaction(client, async (tx) => {
    await lockNames(tx, [`attempt:${entityKey}:${operation}`]);
    const [existing] = await tx
      .select()
      .from(profileAttempts)
      .where(and(eq(profileAttempts.entity_key, entityKey), eq(profileAttempts.operation, operation), or(eq(profileAttempts.run_id, lease.id), inArray(profileAttempts.state, UNSETTLED))))
      .orderBy(desc(profileAttempts.created_at))
      .limit(1);
    if (existing) return { status: "existing" as const, attempt: existing };
    if (maximumUsd === null) {
      await assertOwned(tx, lease);
      return { status: "unknown_price" as const };
    }
    const amount = micros(maximumUsd);
    const taken = await tx
      .update(profileRuns)
      .set({ reserved_micro: sql`${profileRuns.reserved_micro} + ${amount}` })
      .where(and(owned(lease), sql`${profileRuns.spent_micro} + ${profileRuns.reserved_micro} + ${amount} <= ${profileRuns.budget_micro}`))
      .returning({ id: profileRuns.id });
    if (taken.length !== 1) {
      await assertOwned(tx, lease);
      return { status: "budget_deferred" as const };
    }
    const id = randomUUID();
    await tx.insert(profileAttempts).values({ id, run_id: lease.id, entity_key: entityKey, operation, state, reserved_micro: amount, created_at: new Date() });
    return { status: state, id };
  });
}
/** The two-step form: reserve, then dispatch. reserveAndDispatch does both in one transaction. */
export async function reserve(
  client: Executor,
  lease: RunLease,
  entityKey: string,
  operation: string,
  maximumUsd: number | null,
) {
  return reservation(client, lease, entityKey, operation, maximumUsd, "reserved");
}
/** Write before network dispatch. A crash after this point never authorizes another POST. */
export async function reserveAndDispatch(
  client: Executor,
  lease: RunLease,
  entityKey: string,
  operation: string,
  maximumUsd: number | null,
) {
  return reservation(client, lease, entityKey, operation, maximumUsd, "dispatched");
}
/** Marks a reserved attempt dispatched, once, while the run is still this worker's. */
export async function dispatch(client: Executor, lease: RunLease, id: string) {
  const changed = await client
    .update(profileAttempts)
    .set({ state: "dispatched" })
    .where(and(eq(profileAttempts.id, id), eq(profileAttempts.run_id, lease.id), eq(profileAttempts.state, "reserved"), sql`EXISTS (SELECT 1 FROM ${profileRuns} WHERE ${owned(lease)})`))
    .returning({ id: profileAttempts.id });
  if (changed.length === 1) return true;
  await assertOwned(client, lease);
  return false;
}
export async function saveJob(client: Executor, id: string, jobId: string) {
  await client.update(profileAttempts).set({ job_id: jobId }).where(and(eq(profileAttempts.id, id), inArray(profileAttempts.state, ["dispatched", "uncertain"])));
}
export async function uncertain(client: Executor, id: string) {
  await client.update(profileAttempts).set({ state: "uncertain" }).where(and(eq(profileAttempts.id, id), ne(profileAttempts.state, "settled")));
}
/** Response and accounting commit together; profile application can safely replay later. Inside a larger transaction it joins it. */
export async function settle(
  client: Executor,
  id: string,
  costUsd: number | null,
  response: unknown,
) {
  return transaction(client, async (tx) => {
    await lockNames(tx, []);
    // The row lock serializes a replayed settlement with the first; the run row is touched last, so it is held briefly.
    const [attempt] = await tx.select().from(profileAttempts).where(eq(profileAttempts.id, id)).for("update");
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
    await lockNames(tx, [`run:${lease.id}`]);
    const run = await assertOwned(tx, lease);
    const [open] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(profileWork)
      .where(and(eq(profileWork.run_id, lease.id), sql`${profileWork.state} NOT IN ('done','reused')`));
    await tx.update(profileRuns).set({ state: open.count || run.reserved_micro ? "partial" : "complete" }).where(eq(profileRuns.id, lease.id));
  });
}
