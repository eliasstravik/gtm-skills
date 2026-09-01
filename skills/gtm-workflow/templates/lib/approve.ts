// gtm-lib v13
import { defineHook, sleep } from "workflow";
import { z } from "zod";
import {
  getActualRunCostUsd,
  getRunReceipt,
  recordWorkflowProgressAndStatus,
} from "./steps";

export const approvalDecision = z.object({
  approved: z.boolean(),
  comment: z.string().nullable().default(null),
});

export const approvalHook = defineHook({ schema: approvalDecision });
export const triggerHook = defineHook({
  schema: z.record(z.string(), z.unknown()),
});
export const cancellationHook = defineHook({
  schema: z.object({ reason: z.string().nullable().default(null) }),
});

export type WorkflowMeta = {
  runKey: string;
  slug: string;
  checkpoint: number | null;
  scheduledFor?: string | null;
  rowKey?: string;
  step?: string;
};

export type ApprovalResult = {
  approved: boolean;
  comment: string | null;
  outcome: "approved" | "denied" | "timed_out";
};

export async function approve(input: {
  stage: string;
  summary: string;
  meta: WorkflowMeta;
  timeoutMs?: number;
}): Promise<ApprovalResult> {
  if (input.stage.includes(".")) {
    throw new Error("Approval stage names cannot contain dots.");
  }
  const token = approvalToken(input.meta, input.stage);
  const pending = approvalHook.create({ token });
  const approval = { stage: input.stage, token, summary: input.summary };
  await recordWorkflowProgressAndStatus(input.meta.runKey, {
    status: "waiting",
    approval,
  });

  const winner = await Promise.race([
    pending.then((payload) => ({ kind: "hook" as const, payload })),
    sleep(input.timeoutMs ?? 7 * 24 * 60 * 60 * 1_000).then(() => ({
      kind: "timeout" as const,
    })),
  ]);
  await pending.dispose();

  const payload =
    winner.kind === "hook"
      ? winner.payload
      : { approved: false, comment: "timeout" };
  const outcome =
    winner.kind === "timeout"
      ? "timed_out"
      : payload.approved
        ? "approved"
        : "denied";
  await recordWorkflowProgressAndStatus(input.meta.runKey, {
    status:
      outcome === "approved"
        ? "running"
        : outcome === "timed_out"
          ? "timed_out"
          : "stopped",
    stop_reason:
      outcome === "approved"
        ? null
        : outcome === "timed_out"
          ? "approval_timeout"
          : "operator_denied",
    approval: { ...approval, ...payload },
    resolved: true,
  });
  return { ...payload, outcome };
}

export async function checkpoint(
  meta: WorkflowMeta,
  state: {
    completed: number;
    failed: number;
    /** Retained for v8 workflow compatibility; the current library reads actual spend from the ledger. */
    spentUsd: number;
    projectedSpentUsd: number;
    projectedRemainingUsd: number;
    table: string;
  },
): Promise<ApprovalResult> {
  if (meta.checkpoint === null) {
    return { approved: true, comment: null, outcome: "approved" };
  }
  const done = state.completed + state.failed;
  const spentUsd = await getActualRunCostUsd(meta.runKey);
  const receipt = await getRunReceipt(meta.runKey);
  const foundTotal = receipt.success + receipt.empty;
  const hitRate = foundTotal === 0 ? 0 : Math.round((receipt.success / foundTotal) * 100);
  const difference = estimateDifference(
    state.projectedSpentUsd,
    spentUsd,
    receipt.cacheHits,
  );
  const sources = receipt.costSources.length
    ? receipt.costSources
        .map(({ source, costUsd }) => `${source} $${costUsd.toFixed(2)}`)
        .join(", ")
    : "none $0.00";
  await recordWorkflowProgressAndStatus(meta.runKey, {
    completed: state.completed,
    failed: state.failed,
    cost_usd: spentUsd,
    checkpoint: meta.checkpoint,
  });
  return approve({
    stage: "checkpoint",
    meta,
    summary: `${done} rows done, ${state.failed} failed; found ${receipt.success} of ${foundTotal} (${hitRate}%); estimate $${state.projectedSpentUsd.toFixed(2)} versus actual $${spentUsd.toFixed(2)}${difference}; cost sources ${sources}; $${state.projectedRemainingUsd.toFixed(2)} projected for the remaining rows; open ${state.table} in Studio`,
  });
}

function estimateDifference(estimated: number, actual: number, cacheHits: number) {
  if (estimated <= 0 || Math.abs(actual - estimated) / estimated <= 0.2) return "";
  const reason = cacheHits > 0
    ? " because cache hits cost $0"
    : actual < estimated
      ? " because reported cost was lower than the fixed estimate"
      : " because actual provider cost exceeded the fixed estimate";
  return ` (${reason.trim()})`;
}

export async function waitForTrigger(
  meta: WorkflowMeta,
): Promise<Record<string, unknown>> {
  const token = triggerToken(meta);
  const pending = triggerHook.create({ token });
  await recordWorkflowProgressAndStatus(meta.runKey, {
    status: "waiting",
    trigger_token: token,
  });
  const payload = await pending;
  await pending.dispose();
  await recordWorkflowProgressAndStatus(meta.runKey, {
    status: "running",
    trigger_token: null,
  });
  return payload;
}

export function approvalToken(meta: WorkflowMeta, stage: string): string {
  return `${meta.slug}.${meta.runKey}.${stage}`;
}

export function triggerToken(meta: WorkflowMeta): string {
  return `${meta.slug}.${meta.runKey}.trigger`;
}

export function cancellationToken(meta: WorkflowMeta): string {
  return `${meta.slug}.${meta.runKey}.cancel`;
}
