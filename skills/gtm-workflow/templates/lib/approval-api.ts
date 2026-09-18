import { and, eq } from "drizzle-orm";
import { cache } from "../db/tables/cache";
import { approvalHook, APPROVAL_RETENTION_MS, type Approval } from "./approval";
import { db, upsert } from "./db";

/** Route-side reads and decisions for approvals. Never import this from a workflow or lib/agent.ts: it reaches the database and the runtime directly. */

/** Every request of one run, pending first. */
export async function listApprovals(runId: string): Promise<Approval[]> {
  const rows = await db().select().from(cache).where(eq(cache.name, "approval"));
  return rows
    .map((r) => JSON.parse(r.value) as Approval)
    .filter((a) => a.runId === runId)
    .sort((a, b) => Number(a.decidedAt != null) - Number(b.decidedAt != null) || a.requestedAt.localeCompare(b.requestedAt));
}

/** Decides one request and resumes the waiting tool. */
export async function decideApproval(runId: string, token: string, approved: boolean, reason: string | null): Promise<Approval> {
  // Both primary-key columns, so this is an index search; by hash alone it would scan the whole cache table.
  const [row] = await db().select().from(cache).where(and(eq(cache.name, "approval"), eq(cache.hash, token)));
  const record = row ? (JSON.parse(row.value) as Approval) : null;
  if (!record || record.runId !== runId) throw new Error(`No approval ${token} on run ${runId}`);
  if (record.decidedAt) throw new Error(`Approval ${token} was already decided`);
  const decided = { ...record, decidedAt: new Date().toISOString(), approved, reason };
  await approvalHook.resume(token, { approved, reason });
  const now = new Date();
  await upsert("cache", [{ name: "approval", hash: token, value: JSON.stringify(decided), created_at: now.toISOString(), expires_at: new Date(now.getTime() + APPROVAL_RETENTION_MS).toISOString() }], ["name", "hash"]);
  return decided;
}
