// gtm-lib v21
import { defineHook, sleep } from "workflow";
import { z } from "zod";

export const agentDeadlineHook = defineHook({ schema: z.object({ expired: z.literal(true) }) });

/** Isolate the timer so ending one agent never wakes another branch's sleep. */
export async function agentDeadline(timeoutMs: number, token: string): Promise<void> {
  "use workflow";
  await sleep(timeoutMs);
  await signalAgentDeadline(token);
}

/** Notify the waiting agent of its deadline */
export async function signalAgentDeadline(token: string): Promise<void> {
  "use step";
  const { HookNotFoundError } = await import("workflow/errors");
  await agentDeadlineHook.resume(token, { expired: true }).catch((error) => {
    if (!HookNotFoundError.is(error)) throw error;
  });
}

/** Name one timer per agent invocation */
export async function agentDeadlineToken(): Promise<string> {
  "use step";
  const { getStepMetadata, getWorkflowMetadata } = await import("workflow");
  return `${getWorkflowMetadata().workflowRunId}.${getStepMetadata().stepId}.deadline`;
}

/** Start the isolated durable agent timer */
export async function startAgentDeadline(timeoutMs: number, token: string): Promise<string> {
  "use step";
  const { start } = await import("workflow/api");
  const { getWorkflowMetadata } = await import("workflow");
  const run = await start(agentDeadline, [timeoutMs, token], {
    attributes: { timerForRun: getWorkflowMetadata().workflowRunId, purpose: "agent deadline" },
  });
  return run.runId;
}
startAgentDeadline.maxRetries = 0;

/** Record timer completion without waking unrelated workflow waits */
export async function finishAgentDeadline(runId: string): Promise<void> {
  "use step";
  const { getRun } = await import("workflow/api");
  const run = getRun(runId);
  if (!(await run.exists)) return;
  if (["completed", "failed", "cancelled"].includes(await run.status)) return;
  // Waking writes wait_completed. The timer has no effects beyond its now-disposed hook.
  await run.wakeUp();
}
