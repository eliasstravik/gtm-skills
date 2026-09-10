// gtm-lib v22
import { setAttributes, sleep } from "workflow";
import { batchCompletionHook, cancellationHook, cancellationToken, type WorkflowMeta } from "./approve";
import { getActualRunCostUsd, registerWorkflowRun, updateRun } from "./steps";
import type { RunRowsCaps } from "./rows";

export const MAX_BATCH_ROWS = 300;
export const MAX_CHILD_BATCHES = 100;

type BatchState = {
  runKey: string;
  status: string;
  finished: boolean;
  completed: number;
  failed: number;
  remainingKeys: string[];
  stopReason: string | null;
  costUsd: number;
};

/** Own one parent lifecycle; children run sequentially with the remaining budget. */
export async function runBatches<T extends { rows: { key: string }[] }>(options: {
  input: T;
  meta: WorkflowMeta;
  childWorkflow: string;
  batchSize: number;
  timeoutMs: number;
  table: string;
  caps: RunRowsCaps;
}) {
  const { input, meta, batchSize, childWorkflow, timeoutMs } = options;
  const maxSpendUsd = Math.min(options.caps.maxSpendUsd, meta.maxSpendUsd ?? options.caps.maxSpendUsd);
  if (!Number.isFinite(maxSpendUsd) || maxSpendUsd < 0 || !Number.isFinite(options.caps.costPerRowUsd) || options.caps.costPerRowUsd < 0 || !Number.isSafeInteger(options.caps.maxRows) || options.caps.maxRows < 1) throw new Error("Invalid batch caps");
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_ROWS ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 ||
      !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(childWorkflow)) {
    throw new Error("Invalid child workflow, batch size, or deadline");
  }
  if (meta.checkpoint !== null) throw new Error("Batch parents do not accept row checkpoints; review a small input first");
  if (new Set(input.rows.map((row) => row.key)).size !== input.rows.length) throw new Error("Batch rows require unique keys");
  if (input.rows.length > options.caps.maxRows || input.rows.length * options.caps.costPerRowUsd > maxSpendUsd ||
      Math.ceil(input.rows.length / batchSize) > MAX_CHILD_BATCHES) throw new Error("Batch input exceeds accepted limits");
  await registerWorkflowRun(meta.runKey);
  await updateRun(meta.runKey, { completed: 0, failed: 0, remaining_keys: input.rows.map((row) => row.key) });
  const cancellation = cancellationHook.create({ token: cancellationToken(meta) });
  const cancelled = cancellation.then(() => "cancelled" as const);
  const deadlineAt = await batchDeadline(meta.runKey, timeoutMs);
  const deadline = sleep(new Date(deadlineAt)).then(() => "deadline" as const);
  const children: BatchState[] = [];
  let stopReason: string | null = null;
  let remainingKeys: string[] = [];
  let status: "completed" | "failed" | "stopped" | "cancelling" = "completed";
  try {
    for (let index = 0; index < input.rows.length; index += batchSize) {
      const rows = input.rows.slice(index, index + batchSize);
      const remainingBudget = Math.max(0, maxSpendUsd - await getActualRunCostUsd(meta.runKey));
      if (rows.length * options.caps.costPerRowUsd > remainingBudget) {
        status = "stopped"; stopReason = "spend_cap";
        remainingKeys = input.rows.slice(index).map((row) => row.key);
        break;
      }
      const batchIndex = index / batchSize;
      const runKey = `${meta.runKey}-batch-${String(batchIndex).padStart(3, "0")}`;
      const completion = batchCompletionHook.create({ token: `${meta.runKey}.batch.${runKey}` });
      await setAttributes({ stage: `Batch ${batchIndex + 1}`, childWorkflow, batchIndex: String(batchIndex) });
      let child: BatchState;
      try {
        const started = await startBatchChild(childWorkflow, { ...input, rows }, meta, runKey, batchIndex, remainingBudget, deadlineAt);
        if (!started) {
          status = "cancelling"; stopReason = "parent_deadline";
          remainingKeys = input.rows.slice(index).map((row) => row.key);
          await cancelBatchChildren(meta.runKey, stopReason);
          break;
        }
        // A terminal SDK failure before runRows reaches its bookkeeping has no completion
        // notification. Reconciliation supplies that fallback without starting the child again.
        for (;;) {
          const winner = await Promise.race([
            completion.then(() => "completed" as const), cancelled, deadline,
            sleep("5s").then(() => "poll" as const),
          ]);
          if (winner === "cancelled" || winner === "deadline") {
            status = "cancelling";
            stopReason = winner === "deadline" ? "parent_deadline" : "parent_cancelled";
            await cancelBatchChildren(meta.runKey, stopReason);
            child = await readBatchChild(runKey);
            remainingKeys = [...child.remainingKeys, ...input.rows.slice(index + rows.length).map((row) => row.key)];
            break;
          }
          child = await readBatchChild(runKey);
          if (child.finished) break;
        }
      } finally {
        await completion.dispose();
      }
      children.push(child!);
      await updateRun(meta.runKey, {
        completed: children.reduce((sum, child) => sum + child.completed, 0),
        failed: children.reduce((sum, child) => sum + child.failed, 0), cost_usd: await getActualRunCostUsd(meta.runKey),
        remaining_keys: [...remainingKeys, ...child!.remainingKeys, ...input.rows.slice(index + rows.length).map((row) => row.key)],
      });
      if (status === "cancelling") break;
      if (["provider_auth", "provider_quota", "spend_cap"].includes(child!.stopReason ?? "")) {
        status = "stopped"; stopReason = child!.stopReason;
        remainingKeys = [...child!.remainingKeys, ...input.rows.slice(index + rows.length).map((row) => row.key)];
        break;
      }
      remainingKeys.push(...child!.remainingKeys);
    }
  } catch (error) {
    await cancelBatchChildren(meta.runKey, "parent_failed");
    await updateRun(meta.runKey, { status: "cancelling", stop_reason: "parent_failed", error: String(error) });
    throw error;
  } finally {
    await cancellation.dispose();
    // This helper owns the parent run. Wake its deadline and any losing poll timers.
    await finishBatchWaits();
  }
  if (status === "completed" && children.some((child) => child.status !== "completed")) status = "failed";
  const completed = children.reduce((sum, child) => sum + child.completed, 0);
  const failed = children.reduce((sum, child) => sum + child.failed, 0);
  await updateRun(meta.runKey, {
    status, completed, failed, cost_usd: await getActualRunCostUsd(meta.runKey),
    stop_reason: stopReason, remaining_keys: remainingKeys, finished: status !== "cancelling",
  });
  return { status, completed, failed, remainingKeys, stopReason, children };
}

/** Start the next child batch */
export async function startBatchChild(
  path: string, input: { rows: { key: string }[] }, parent: WorkflowMeta,
  runKey: string, batchIndex: number, maxSpendUsd: number,
  deadlineAt: number,
): Promise<boolean> {
  "use step";
  const { createHash } = await import("node:crypto");
  const { start } = await import("workflow/api");
  const { getRunRow, insertRun, updateRunPlain, cancelRunTree } = await import("./db");
  const parentRow = await getRunRow(parent.runKey);
  if (!parentRow || parentRow.cancelRequestedAt !== null || parentRow.finishedAt !== null || parentRow.parentRunKey) {
    throw new Error("Batch parent is not active or is itself a child");
  }
  if (Date.now() >= deadlineAt) return false;
  const existing = await getRunRow(runKey);
  if (existing) {
    if (existing.runId) return true;
    throw new Error("Child start outcome is uncertain; inspect it before retrying");
  }
  const slug = path.split("/").at(-1)!;
  const body = JSON.stringify(input);
  await insertRun({ runKey, parentRunKey: parent.runKey, workflow: slug, path, method: "POST",
    input: body, remainingKeys: JSON.stringify(input.rows.map((row) => row.key)), inputHash: createHash("sha256").update(body).digest("hex"), status: "running", startedAt: Date.now() });
  const functionName = slug.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
  const run = await start({ workflowId: `workflow//./workflows/${path}//${functionName}` }, [input,
    { runKey, slug, checkpoint: null, maxSpendUsd } satisfies WorkflowMeta], {
    attributes: { parentRunKey: parent.runKey, gtmRunKey: runKey, batchIndex: String(batchIndex),
      workflow: slug, workspaceHead: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" },
  });
  await updateRunPlain(runKey, { runId: run.runId });
  const currentParent = await getRunRow(parent.runKey);
  if (currentParent?.cancelRequestedAt !== null || currentParent?.finishedAt !== null) await cancelRunTree(runKey, "parent_cancelled");
  return true;
}
startBatchChild.maxRetries = 0;

/** Fix the parent deadline to its original start */
export async function batchDeadline(runKey: string, timeoutMs: number): Promise<number> {
  "use step";
  const { getRunRow } = await import("./db");
  const row = await getRunRow(runKey);
  if (!row) throw new Error("Unknown batch parent");
  return row.startedAt + timeoutMs;
}

/** Read the child batch outcome */
export async function readBatchChild(runKey: string): Promise<BatchState> {
  "use step";
  const { reconcileRun } = await import("./db");
  const row = await reconcileRun(runKey);
  const rows: { key: string }[] = JSON.parse(row.input).rows;
  return { runKey, status: row.status, finished: row.finishedAt !== null, completed: row.completed ?? 0,
    failed: row.failed ?? (row.status === "failed" ? rows.length : 0),
    remainingKeys: row.remainingKeys ? JSON.parse(row.remainingKeys) : row.status === "cancelled" || row.status === "cancelling" ? rows.map((row) => row.key) : [],
    stopReason: row.stopReason, costUsd: row.costUsd ?? 0 };
}

/** Stop unfinished child batches */
export async function cancelBatchChildren(runKey: string, reason: string): Promise<void> {
  "use step";
  const { getChildRuns, cancelRunTree, updateRunPlain } = await import("./db");
  await updateRunPlain(runKey, { status: "cancelling", stopReason: reason, cancelRequestedAt: Date.now() });
  for (const child of await getChildRuns(runKey)) if (child.finishedAt === null) await cancelRunTree(child.runKey, reason);
}

/** Finish the parent batch timers */
export async function finishBatchWaits(): Promise<void> {
  "use step";
  const { getWorkflowMetadata } = await import("workflow");
  const { getRun } = await import("workflow/api");
  await getRun(getWorkflowMetadata().workflowRunId).wakeUp();
}
