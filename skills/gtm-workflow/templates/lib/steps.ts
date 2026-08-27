// gtm-lib v9
import { eq, sql } from "drizzle-orm";
import { getDb, updateRunPlain } from "./db";
import { enrichmentRuns } from "./schema";

export type ApprovalState = {
  stage: string;
  token: string;
  summary: string;
  approved?: boolean;
  comment?: string | null;
  resolved_at?: number;
};

export type RunPatch = {
  status?: "running" | "waiting" | "completed" | "failed" | "cancelled";
  run_id?: string | null;
  completed?: number | null;
  failed?: number | null;
  cost_usd?: number | null;
  checkpoint?: number | null;
  webhook_url?: string | null;
  approval?: ApprovalState | null;
  error?: string | null;
  finished?: boolean;
  resolved?: boolean;
};

export async function recordWorkflowProgressAndStatus(
  runKey: string,
  patch: RunPatch,
): Promise<void> {
  "use step";
  const now = Date.now();
  const approval =
    patch.approval && patch.resolved
      ? { ...patch.approval, resolved_at: now }
      : patch.approval;
  const actualCostUsd =
    patch.cost_usd !== undefined || patch.finished
      ? await getActualRunCostUsd(runKey)
      : undefined;
  await updateRunPlain(runKey, {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.run_id !== undefined ? { runId: patch.run_id } : {}),
    ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
    ...(patch.failed !== undefined ? { failed: patch.failed } : {}),
    ...(actualCostUsd !== undefined ? { costUsd: actualCostUsd } : {}),
    ...(patch.checkpoint !== undefined ? { checkpoint: patch.checkpoint } : {}),
    ...(patch.webhook_url !== undefined ? { webhookUrl: patch.webhook_url } : {}),
    ...(approval !== undefined
      ? { approval: approval === null ? null : JSON.stringify(approval) }
      : {}),
    ...(patch.error !== undefined ? { error: patch.error } : {}),
    ...(patch.finished ? { finishedAt: now } : {}),
  });
}

export const updateRun = recordWorkflowProgressAndStatus;

export async function getActualRunCostUsd(runKey: string): Promise<number> {
  "use step";
  const db = await getDb();
  const row = (
    await db
      .select({
        costUsd: sql<number>`coalesce(sum(${enrichmentRuns.costUsd}), 0)`,
      })
      .from(enrichmentRuns)
      .where(eq(enrichmentRuns.runKey, runKey))
  )[0];
  return Number(row?.costUsd ?? 0);
}
