import { FatalError, getWorkflowMetadata } from "workflow";

/**
 * Reach a person from a run, through the GTM agent's notify route, which opens or continues a Slack thread.
 * Needs GTM_AGENT_URL and GTM_NOTIFY_SECRET on the workflow project; without them the step fails and names them.
 * A workflow calls the agent only to reach people, never to think.
 */
export type Notification = {
  /** tell: post it. ask: post it and expect an answer, usually an approval. show: post results. handoff: open a thread a person can steer. */
  kind: "tell" | "ask" | "show" | "handoff";
  text: string;
  /** An approval to decide, when kind is ask. */
  approval?: { token: string };
  /** A Slack target the agent should use instead of its default channel: { channelId, threadTs? }. */
  target?: { channelId: string; threadTs?: string };
};

/** Workflow scope: adds the run's identity, then posts through a step. */
export async function notify(n: Notification): Promise<void> {
  const { workflowRunId, workflowName } = getWorkflowMetadata();
  await postNotification({ ...n, runId: workflowRunId, workflow: workflowName });
}

/** Whether notifications are configured; read in workflow scope from the frozen environment snapshot. */
export function canNotify(): boolean {
  return Boolean(process.env.GTM_AGENT_URL && process.env.GTM_NOTIFY_SECRET);
}

async function postNotification(body: Notification & { runId: string; workflow: string }): Promise<void> {
  "use step";
  const base = process.env.GTM_AGENT_URL;
  const secret = process.env.GTM_NOTIFY_SECRET;
  if (!base || !secret) throw new FatalError("Set GTM_AGENT_URL and GTM_NOTIFY_SECRET on the workflow project to notify people");
  const res = await fetch(`${base.replace(/\/$/, "")}/gtm/notify`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`The agent's notify route answered HTTP ${res.status}`);
}
postNotification.maxRetries = 2;
