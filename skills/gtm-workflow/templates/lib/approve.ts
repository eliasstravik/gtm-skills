// gtm-lib v4
import { defineHook, sleep } from "workflow";
import { z } from "zod";
import { updateRun } from "./steps";

const approvalHook = defineHook({
  schema: z.object({
    approved: z.boolean(),
    comment: z.string().nullable().default(null),
  }),
});

export type WorkflowMeta = {
  runKey: string;
  slug: string;
  checkpoint: number | null;
};

export async function approve(input: {
  stage: string;
  summary: string;
  meta: WorkflowMeta;
  timeoutMs?: number;
}): Promise<{ approved: boolean; comment: string | null }> {
  if (input.stage.includes(".")) throw new Error("Approval stage names cannot contain dots.");
  const token = `${input.meta.slug}.${input.meta.runKey}.${input.stage}`;
  const pending = approvalHook.create({ token });
  const approval = { stage: input.stage, token, summary: input.summary };
  await updateRun(input.meta.runKey, {
    status: "waiting",
    approval,
  });

  const winner = await Promise.race([
    pending.then((payload) => ({ kind: "hook" as const, payload })),
    sleep(input.timeoutMs ?? 7 * 24 * 60 * 60 * 1_000).then(() => ({
      kind: "timeout" as const,
    })),
  ]);
  const payload =
    winner.kind === "hook"
      ? winner.payload
      : { approved: false, comment: "timeout" };
  if (winner.kind === "timeout") await pending.dispose();

  await updateRun(input.meta.runKey, {
    status: "running",
    approval: { ...approval, ...payload },
    resolved: true,
  });
  return payload;
}

export async function checkpoint(
  meta: WorkflowMeta,
  state: {
    completed: number;
    failed: number;
    spentUsd: number;
    projectedRemainingUsd: number;
    table: string;
  },
): Promise<{ approved: boolean; comment: string | null }> {
  if (meta.checkpoint === null) return { approved: true, comment: null };
  const done = state.completed + state.failed;
  await updateRun(meta.runKey, {
    completed: state.completed,
    failed: state.failed,
    cost_usd: state.spentUsd,
    checkpoint: meta.checkpoint,
  });
  return approve({
    stage: "checkpoint",
    meta,
    summary: `${done} rows done, ${state.failed} failed, $${state.spentUsd.toFixed(2)} spent, $${state.projectedRemainingUsd.toFixed(2)} projected for the remaining rows; open ${state.table} in Studio`,
  });
}
