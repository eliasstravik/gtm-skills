// gtm-lib v5
import { updateRunPlain } from "./db";

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
  await updateRunPlain(runKey, {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.run_id !== undefined ? { runId: patch.run_id } : {}),
    ...(patch.completed !== undefined ? { completed: patch.completed } : {}),
    ...(patch.failed !== undefined ? { failed: patch.failed } : {}),
    ...(patch.cost_usd !== undefined ? { costUsd: patch.cost_usd } : {}),
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
