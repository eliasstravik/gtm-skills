import { and, eq, inArray } from "drizzle-orm";
import { cache as cacheTable } from "../db/tables/cache";
import { defineHook, getWorkflowMetadata, setAttributes } from "workflow";
import { resumeHook, start } from "workflow/api";
import { z } from "zod";
import { db, table, upsert, type TableName } from "./db";
import { canNotify, notify, type SlackTarget } from "./notify";
import { rowFailure } from "./failure";

export type Row = { key: string } & Record<string, unknown>;
export type StepResult = Record<string, unknown> & { costUsd: number };
export type RunResult = {
  done: number;
  failed: number;
  skipped: number;
  spentUsd: number;
  stopReason: "complete" | "maxRows" | "maxSpendUsd";
};

/** Keys whose row is fresh: updated_at within freshForMs and error null. */
export async function readFresh(
  tableName: TableName,
  keys: string[],
  freshForMs: number,
): Promise<string[]> {
  "use step";
  if (keys.length === 0) return [];
  const t = table(tableName) as unknown as {
    key: never;
    updated_at: never;
    error: never;
  };
  const since = new Date(Date.now() - freshForMs).toISOString();
  const rows = (await db()
    .select({ key: t.key, updated_at: t.updated_at, error: t.error })
    .from(t as never)
    .where(inArray(t.key, keys))) as unknown as {
    key: string;
    updated_at: string;
    error: string | null;
  }[];
  return rows
    .filter((r) => r.error == null && r.updated_at >= since)
    .map((r) => r.key);
}

/** Persist one row. Date.now() is called here, inside the step, so workflow scope stays replay-deterministic. */
export async function saveRow(
  tableName: TableName,
  row: Record<string, unknown>,
): Promise<void> {
  "use step";
  await upsert(
    tableName,
    [{ ...row, updated_at: new Date().toISOString() }],
    ["key"],
  );
}

/** A workflow's input: rows plus the caps; `notify` is the channel this run posts in, top-level, when the caller overrides the workflow's own; `parent` is set only on a child started by fanOut. */
export type RowsInput = {
  rows?: Row[];
  maxRows?: number;
  maxSpendUsd?: number;
  notify?: { channelId: string };
  parent?: string;
};

type SlackPost = { text: string; blocks: unknown[] };

/**
 * How a run tells people about its rows, posted straight to Slack without a model. `every` is a count, never a judgment:
 * row: one post per finished row. chunk: one post per run of rows, so one per child when fanned out. run: one post with
 * the totals when the whole run ends. Skipped when GTM_AGENT_URL and GTM_NOTIFY_SECRET are unset.
 */
export type RowsNotify = {
  /** Where to post: `input.notify ?? NOTIFY`. */
  target: SlackTarget;
  every: "row" | "chunk" | "run";
  /** One line per finished row, for row and chunk; rich posts may add Slack blocks. */
  line?: (row: Row, columns: Record<string, unknown>) => string | SlackPost;
};

export type RunRowsOptions = {
  rows: Row[];
  table: TableName;
  notify?: RowsNotify;
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
  fanOut?: {
    workflow: (input: never) => Promise<unknown>;
    input: RowsInput;
    chunkSize: number;
    concurrency?: number;
  };
};

const childHook = defineHook({
  schema: z.object({
    done: z.number(),
    failed: z.number(),
    skipped: z.number(),
    spentUsd: z.number(),
    stopReason: z.enum(["complete", "maxRows", "maxSpendUsd"]),
  }),
});

/** Workflow-scope loop, never a step: skips fresh keys, checks both caps before each batch, runs step(row) per row, persists through save. */
export async function runRows(o: RunRowsOptions): Promise<RunResult> {
  await tagRun(o);
  const read = o.read ?? readFresh;
  const save = o.save ?? saveRow;
  const concurrency = o.concurrency ?? 1;
  const fresh = new Set(
    await read(
      o.table,
      o.rows.map((r) => r.key),
      o.freshForMs,
    ),
  );
  const pending = o.rows.filter((r) => !fresh.has(r.key));
  const result: RunResult = {
    done: 0,
    failed: 0,
    skipped: fresh.size,
    spentUsd: 0,
    stopReason: "complete",
  };

  const isChild = Boolean(o.fanOut?.input.parent);
  const lines: string[] = [];

  if (o.fanOut && pending.length > o.fanOut.chunkSize && !isChild) {
    const summed = await fanOut(o, pending);
    summed.skipped += result.skipped;
    if (o.notify?.every === "run") await postSummary(o.notify, summed);
    return summed;
  }

  for (let i = 0; i < pending.length;) {
    const attempted = result.done + result.failed;
    if (attempted >= o.maxRows) {
      result.stopReason = "maxRows";
      break;
    }
    const batch = pending.slice(
      i,
      i + Math.min(concurrency, o.maxRows - attempted),
    );
    if (result.spentUsd + batch.length * o.estimateUsd > o.maxSpendUsd) {
      result.stopReason = "maxSpendUsd";
      break;
    }
    i += batch.length;
    const outcomes = await Promise.allSettled(
      batch.map(async (row) => {
        try {
          const { costUsd, ...columns } = await o.step(row);
          await save(o.table, {
            ...columns,
            key: row.key,
            cost_usd: costUsd,
            error: null,
          });
          if (o.notify && o.notify.every !== "run") {
            const message = (o.notify.line ?? ((r) => r.key))(row, columns);
            if (o.notify.every === "row") await post(o.notify.target, message);
            else
              lines.push(typeof message === "string" ? message : message.text);
          }
          return costUsd;
        } catch (error) {
          // A failed row is charged its estimate: it may have paid before it threw, so the cap never undercounts.
          await save(o.table, {
            key: row.key,
            error: rowFailure(error, getWorkflowMetadata().workflowRunId),
            cost_usd: o.estimateUsd,
          });
          throw error;
        }
      }),
    );
    for (const out of outcomes) {
      if (out.status === "fulfilled") {
        result.done += 1;
        result.spentUsd += out.value;
      } else {
        result.failed += 1;
        result.spentUsd += o.estimateUsd;
      }
    }
  }
  if (o.notify?.every === "chunk" && lines.length > 0)
    await post(o.notify.target, clip(lines));
  if (o.notify?.every === "run" && !isChild)
    await postSummary(o.notify, result);
  if (isChild) await reportToParent(o.fanOut!.input.parent!, result);
  return result;
}

/** Workflow scope: one Slack post, skipped when the notify variables are unset, so a local run without them still completes. */
async function post(
  target: SlackTarget,
  message: string | SlackPost,
): Promise<void> {
  if (canNotify()) {
    if (typeof message === "string")
      await notify({ kind: "tell", text: message, target });
    else
      await notify({
        kind: "show",
        text: message.text,
        blocks: message.blocks,
        target,
      });
  }
}

async function postSummary(n: RowsNotify, r: RunResult): Promise<void> {
  const stopped =
    r.stopReason === "complete"
      ? ""
      : `; stopped at the ${r.stopReason === "maxRows" ? "row" : "spend"} cap`;
  await post(
    n.target,
    `${workflowSlug()}: ${r.done} done, ${r.failed} failed, ${r.skipped} fresh${stopped}; $${r.spentUsd.toFixed(2)}.`,
  );
}

/** Slack rejects messages over 40k characters; keep a chunk post well under that and say how many lines were left out. */
function clip(lines: string[], max = 3800): string {
  let out = "";
  for (let i = 0; i < lines.length; i++) {
    const next = out ? `${out}\n${lines[i]}` : (lines[i] as string);
    if (next.length > max)
      return `${out}\n… and ${lines.length - i} more rows in the table.`;
    out = next;
  }
  return out;
}

/** workflowName is `workflow//./workflows/<slug>//<function>`; the slug is what the routes and links use. */
function workflowSlug(): string {
  const parts = getWorkflowMetadata().workflowName.split("//");
  return (parts[1] ?? "").split("/").pop() || parts[parts.length - 1] || "";
}

/** Workflow scope: tags the run so the runs page can filter by workflow, list size, channel, and parent. Plain strings only. */
async function tagRun(o: RunRowsOptions): Promise<void> {
  const input = o.fanOut?.input;
  await setAttributes({
    workflow: workflowSlug(),
    rows: String(o.rows.length),
    ...(input?.notify?.channelId && { channel: input.notify.channelId }),
    ...(input?.parent && {
      parent: input.parent.split(":chunk:")[0] as string,
    }),
  });
}

/** Workflow scope: the parent's share of a fanned-out run. Rows beyond the caps are not started at all. */
async function fanOut(o: RunRowsOptions, pending: Row[]): Promise<RunResult> {
  const {
    workflow,
    input,
    chunkSize,
    concurrency = 4,
  } = o.fanOut as NonNullable<RunRowsOptions["fanOut"]>;
  const affordable = Math.floor(o.maxSpendUsd / o.estimateUsd);
  const selected = pending.slice(0, Math.min(o.maxRows, affordable));
  const chunks: Row[][] = [];
  for (let i = 0; i < selected.length; i += chunkSize)
    chunks.push(selected.slice(i, i + chunkSize));
  const { workflowRunId } = getWorkflowMetadata();
  const workflowId = (workflow as unknown as { workflowId?: string })
    .workflowId;
  if (!workflowId)
    throw new Error("fanOut.workflow must be the workflow function itself");
  const total: RunResult = {
    done: 0,
    failed: 0,
    skipped: 0,
    spentUsd: 0,
    stopReason:
      selected.length < pending.length
        ? affordable < o.maxRows
          ? "maxSpendUsd"
          : "maxRows"
        : "complete",
  };
  for (let wave = 0; wave < chunks.length; wave += concurrency) {
    const waveChunks = chunks.slice(wave, wave + concurrency);
    const hooks = waveChunks.map((_, j) =>
      childHook.create({ token: `${workflowRunId}:chunk:${wave + j}` }),
    );
    const children = await Promise.all(
      waveChunks.map((chunk, j) =>
        startChild(workflowId, {
          ...input,
          rows: chunk,
          maxRows: chunk.length,
          maxSpendUsd: round(chunk.length * o.estimateUsd),
          parent: `${workflowRunId}:chunk:${wave + j}`,
        }),
      ),
    );
    // The cancel route reads this list and cancels the children with the parent.
    await recordChildren(workflowRunId, children);
    for (const r of await Promise.all(hooks)) {
      total.done += r.done;
      total.failed += r.failed;
      total.skipped += r.skipped;
      total.spentUsd = round(total.spentUsd + r.spentUsd);
    }
  }
  return total;
}

async function startChild(
  workflowId: string,
  input: RowsInput,
): Promise<string> {
  "use step";
  const { getWorld } = await import("workflow/runtime");
  const parentId = getWorkflowMetadata().workflowRunId;
  const parent = await (
    await getWorld()
  ).runs.get(parentId, { resolveData: "none" });
  const attributes = Object.fromEntries(
    Object.entries(parent.attributes ?? {}).filter(([key]) =>
      key.startsWith("gtm.viewer."),
    ),
  );
  const run = await start({ workflowId }, [input] as never, {
    attributes: { ...attributes, "gtm.viewer.parent": parentId },
  });
  return run.runId;
}

/** Appends child run ids to the parent's record in the cache table, under the name `children`, kept 30 days. */
async function recordChildren(
  parentRunId: string,
  runIds: string[],
): Promise<void> {
  "use step";
  const [row] = await db()
    .select()
    .from(cacheTable)
    .where(
      and(eq(cacheTable.name, "children"), eq(cacheTable.hash, parentRunId)),
    );
  const known = row ? (JSON.parse(row.value) as string[]) : [];
  const now = new Date();
  await upsert(
    "cache",
    [
      {
        name: "children",
        hash: parentRunId,
        value: JSON.stringify([...known, ...runIds]),
        created_at: now.toISOString(),
        expires_at: new Date(
          now.getTime() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    ],
    ["name", "hash"],
  );
}

async function reportToParent(token: string, result: RunResult): Promise<void> {
  "use step";
  await resumeHook(token, result);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
