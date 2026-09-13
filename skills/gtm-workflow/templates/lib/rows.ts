import { inArray } from "drizzle-orm";
import { db, table, upsert, type TableName } from "./db";

export type Row = { key: string } & Record<string, unknown>;
export type StepResult = Record<string, unknown> & { costUsd: number };
export type RunResult = { done: number; failed: number; skipped: number; spentUsd: number; stopReason: "complete" | "maxRows" | "maxSpendUsd" };

/** Keys whose row is fresh: updated_at within freshForMs and error null. */
export async function readFresh(tableName: TableName, keys: string[], freshForMs: number): Promise<string[]> {
  "use step";
  if (keys.length === 0) return [];
  const t = table(tableName) as unknown as { key: never; updated_at: never; error: never };
  const since = new Date(Date.now() - freshForMs).toISOString();
  const rows = (await db().select({ key: t.key, updated_at: t.updated_at, error: t.error }).from(t as never).where(inArray(t.key, keys))) as unknown as { key: string; updated_at: string; error: string | null }[];
  return rows.filter((r) => r.error == null && r.updated_at >= since).map((r) => r.key);
}

/** Persist one row. Date.now() is called here, inside the step, so workflow scope stays replay-deterministic. */
export async function saveRow(tableName: TableName, row: Record<string, unknown>): Promise<void> {
  "use step";
  await upsert(tableName, [{ ...row, updated_at: new Date().toISOString() }], ["key"]);
}

export type RunRowsOptions = {
  rows: Row[];
  table: TableName;
  /** Plain async function in workflow scope; awaits "use step" functions and returns { ...columns, costUsd }. */
  step: (row: Row) => Promise<StepResult>;
  read?: typeof readFresh;
  save?: typeof saveRow;
  /** Counts attempted rows after freshness skipping. */
  maxRows: number;
  maxSpendUsd: number;
  estimateUsd: number;
  concurrency?: number;
  freshForMs: number;
};

/** Workflow-scope loop, never a step: skips fresh keys, checks both caps before each batch, runs step(row) per row, persists through save. */
export async function runRows(o: RunRowsOptions): Promise<RunResult> {
  const read = o.read ?? readFresh;
  const save = o.save ?? saveRow;
  const concurrency = o.concurrency ?? 1;
  const fresh = new Set(await read(o.table, o.rows.map((r) => r.key), o.freshForMs));
  const pending = o.rows.filter((r) => !fresh.has(r.key));
  const result: RunResult = { done: 0, failed: 0, skipped: fresh.size, spentUsd: 0, stopReason: "complete" };
  for (let i = 0; i < pending.length; ) {
    const attempted = result.done + result.failed;
    if (attempted >= o.maxRows) { result.stopReason = "maxRows"; break; }
    const batch = pending.slice(i, i + Math.min(concurrency, o.maxRows - attempted));
    if (result.spentUsd + batch.length * o.estimateUsd > o.maxSpendUsd) { result.stopReason = "maxSpendUsd"; break; }
    i += batch.length;
    const outcomes = await Promise.allSettled(batch.map(async (row) => {
      try {
        const { costUsd, ...columns } = await o.step(row);
        await save(o.table, { ...columns, key: row.key, cost_usd: costUsd, error: null });
        return costUsd;
      } catch (error) {
        // A failed row is charged its estimate: it may have paid before it threw, so the cap never undercounts.
        await save(o.table, { key: row.key, error: String(error), cost_usd: o.estimateUsd });
        throw error;
      }
    }));
    for (const out of outcomes) {
      if (out.status === "fulfilled") { result.done += 1; result.spentUsd += out.value; }
      else { result.failed += 1; result.spentUsd += o.estimateUsd; }
    }
  }
  return result;
}
