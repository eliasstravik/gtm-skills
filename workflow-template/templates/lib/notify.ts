import { FatalError, getWorkflowMetadata } from "workflow";

/**
 * Reach a person from a run, through the GTM agent's notify route, which posts the text straight to Slack with the
 * agent's bot token; no model runs. tell and show are plain posts. ask and handoff post a message whose thread the
 * agent watches: a person's reply there wakes it, and it decides the approval or steers the run.
 * Needs GTM_AGENT_URL and GTM_NOTIFY_SECRET on the workflow project; without them the step fails and names them.
 * A workflow calls the agent only to reach people, never to think.
 */
/** A Slack channel; every post lands top-level there, never in a thread. Channel ids look like C0BSS68KE0P. */
export type SlackTarget = { channelId: string };

export type Notification = {
  /** tell: post it. ask: post it and expect an answer, usually an approval. show: post results. handoff: open a thread a person can steer. */
  kind: "tell" | "ask" | "show" | "handoff";
  text: string;
  /**
   * Slack Block Kit blocks for a richer post: a `markdown` block for prose, one `actions` block of `button` elements
   * with a `url` for things to open, a `section` with `fields` for results. The text stays the plain fallback and
   * must say everything the blocks say; 50 blocks at most, and a refused block set posts the text alone.
   */
  blocks?: unknown[];
  /** An approval to decide, when kind is ask. */
  approval?: { token: string };
  /** Where to post; the agent's default channel when omitted. */
  target?: SlackTarget;
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
