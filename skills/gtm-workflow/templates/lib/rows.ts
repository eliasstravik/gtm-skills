import { inArray } from "drizzle-orm";
import { defineHook, getWorkflowMetadata } from "workflow";
import { resumeHook, start } from "workflow/api";
import { z } from "zod";
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

/** A workflow's input: rows plus the caps; `notify` is where this run should reach people (the thread it was started from, typically); `parent` is set only on a child started by fanOut. */
export type RowsInput = { rows?: Row[]; maxRows?: number; maxSpendUsd?: number; notify?: { channelId: string; threadTs?: string }; parent?: string };

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
  /**
   * Large lists: above chunkSize rows, this run only splits the list and starts one child run of the same workflow per
   * chunk, `concurrency` children at a time (default 4), each with its exact share of the caps; the children report back
   * through hooks and the totals add up here. `workflow` is the workflow function itself and `input` its input.
   */
  fanOut?: { workflow: (input: never) => Promise<RunResult>; input: RowsInput; chunkSize: number; concurrency?: number };
};

const childHook = defineHook({ schema: z.object({ done: z.number(), failed: z.number(), skipped: z.number(), spentUsd: z.number(), stopReason: z.enum(["complete", "maxRows", "maxSpendUsd"]) }) });

/** Workflow-scope loop, never a step: skips fresh keys, checks both caps before each batch, runs step(row) per row, persists through save. */
export async function runRows(o: RunRowsOptions): Promise<RunResult> {
  const read = o.read ?? readFresh;
  const save = o.save ?? saveRow;
  const concurrency = o.concurrency ?? 1;
  const fresh = new Set(await read(o.table, o.rows.map((r) => r.key), o.freshForMs));
  const pending = o.rows.filter((r) => !fresh.has(r.key));
  const result: RunResult = { done: 0, failed: 0, skipped: fresh.size, spentUsd: 0, stopReason: "complete" };

  if (o.fanOut && pending.length > o.fanOut.chunkSize && o.fanOut.input.parent == null) {
    const summed = await fanOut(o, pending);
    if (o.fanOut.input.parent) await reportToParent(o.fanOut.input.parent, summed);
    return { ...summed, skipped: summed.skipped + result.skipped };
  }

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
  if (o.fanOut?.input.parent) await reportToParent(o.fanOut.input.parent, result);
  return result;
}

/** Workflow scope: the parent's share of a fanned-out run. Rows beyond the caps are not started at all. */
async function fanOut(o: RunRowsOptions, pending: Row[]): Promise<RunResult> {
  const { workflow, input, chunkSize, concurrency = 4 } = o.fanOut as NonNullable<RunRowsOptions["fanOut"]>;
  const affordable = Math.floor(o.maxSpendUsd / o.estimateUsd);
  const selected = pending.slice(0, Math.min(o.maxRows, affordable));
  const chunks: Row[][] = [];
  for (let i = 0; i < selected.length; i += chunkSize) chunks.push(selected.slice(i, i + chunkSize));
  const { workflowRunId } = getWorkflowMetadata();
  const workflowId = (workflow as unknown as { workflowId?: string }).workflowId;
  if (!workflowId) throw new Error("fanOut.workflow must be the workflow function itself");
  const total: RunResult = { done: 0, failed: 0, skipped: 0, spentUsd: 0, stopReason: selected.length < pending.length ? (affordable < o.maxRows ? "maxSpendUsd" : "maxRows") : "complete" };
  for (let wave = 0; wave < chunks.length; wave += concurrency) {
    const waveChunks = chunks.slice(wave, wave + concurrency);
    const hooks = waveChunks.map((_, j) => childHook.create({ token: `${workflowRunId}:chunk:${wave + j}` }));
    await Promise.all(waveChunks.map((chunk, j) => startChild(workflowId, { ...input, rows: chunk, maxRows: chunk.length, maxSpendUsd: round(chunk.length * o.estimateUsd), parent: `${workflowRunId}:chunk:${wave + j}` })));
    for (const r of await Promise.all(hooks)) {
      total.done += r.done; total.failed += r.failed; total.skipped += r.skipped; total.spentUsd = round(total.spentUsd + r.spentUsd);
    }
  }
  return total;
}

async function startChild(workflowId: string, input: RowsInput): Promise<string> {
  "use step";
  const run = await start({ workflowId }, [input] as never);
  return run.runId;
}

async function reportToParent(token: string, result: RunResult): Promise<void> {
  "use step";
  await resumeHook(token, result);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
