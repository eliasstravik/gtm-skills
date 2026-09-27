import { and, eq, sql } from "drizzle-orm";
import { cache } from "./schema/cache";
import { approvalHook, APPROVAL_RETENTION_MS, type Approval } from "./approval";
import { db } from "./db";

/** Route-side reads and decisions for approvals. Never import this from a workflow or lib/agent.ts: it reaches the database and the runtime directly. */

/** Every request of one run, pending first. */
export async function listApprovals(runId: string): Promise<Approval[]> {
  const rows = await db().select().from(cache).where(eq(cache.name, "approval"));
  return rows
    .map((r) => r.value as Approval)
    .filter((a) => a.runId === runId)
    .sort((a, b) => Number(a.decidedAt != null) - Number(b.decidedAt != null) || a.requestedAt.localeCompare(b.requestedAt));
}

/**
 * Decides one request and resumes the waiting tool. The decision is claimed first with one conditional update, so of
 * two answers at once (approve and reject, or two approvals) exactly one wins and the record always says what the run
 * was told. If the run can no longer hear it (cancelled, finished), the claim is undone and the error returned.
 */
export async function decideApproval(runId: string, token: string, approved: boolean, reason: string | null): Promise<Approval> {
  const now = new Date(), decision = { decidedAt: now.toISOString(), approved, reason };
  const request = and(eq(cache.name, "approval"), eq(cache.hash, token), sql`${cache.value}->>'runId' = ${runId}`);
  const [row] = await db().update(cache)
    .set({ value: sql`${cache.value} || ${JSON.stringify(decision)}::jsonb`, expires_at: new Date(now.getTime() + APPROVAL_RETENTION_MS) })
    .where(and(request, sql`${cache.value}->>'decidedAt' IS NULL`))
    .returning({ value: cache.value });
  if (!row) {
    const [existing] = await db().select({ hash: cache.hash }).from(cache).where(request);
    throw new Error(existing ? `Approval ${token} was already decided` : `No approval ${token} on run ${runId}`);
  }
  try {
    await approvalHook.resume(token, { approved, reason });
  } catch (error) {
    await db().update(cache).set({ value: sql`${cache.value} || '{"decidedAt":null,"approved":null,"reason":null}'::jsonb` })
      .where(and(request, sql`${cache.value}->>'decidedAt' = ${decision.decidedAt}`));
    throw error;
  }
  return row.value as Approval;
}
