# Patterns: native SDK calls with worked examples

Helpers in `lib/` exist only where a bare SDK call was shown to fail or double-spend. Everything below is a plain Vercel Workflow call the agent writes itself, copied from these examples. Each compiled and ran in the scaffold on 2026-09-14.

Contents: [Retries with backoff](#retries-with-backoff) · [Waiting](#waiting) · [Waiting for an outside event](#waiting-for-an-outside-event) · [Child runs](#child-runs) · [Inbound webhooks](#inbound-webhooks) · [Reaching a person](#reaching-a-person) · [Run attributes](#run-attributes)

## Retries with backoff

A paid or AI step keeps `maxRetries = 0`. A free or idempotent call may retry, with a longer wait each attempt on a rate limit and no retry on a client error. Diagram: the step's normal node; nothing extra.

```ts
import { FatalError, getStepMetadata, RetryableError } from "workflow";

async function callProvider(url: string) {
  "use step";
  const { attempt } = getStepMetadata();
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 429) throw new RetryableError("Rate limited", { retryAfter: `${2 ** attempt * 5}s` });
  if (res.status >= 400 && res.status < 500) throw new FatalError(`${url} answered HTTP ${res.status}`);
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return res.json();
}
callProvider.maxRetries = 4;
```

## Waiting

`sleep` takes a duration or a date and costs nothing while it waits. Workflow scope only. Diagram: a `wait` node, `Wait a day<br/><small>sleep · free</small>`.

```ts
import { sleep } from "workflow";

await sleep("1d");
await sleep(new Date("2026-10-01T08:00:00Z"));
```

## Waiting for an outside event

Any external system can resume a hook by token; the workflow pauses at `await hook`. Give up with a race against `sleep`. Diagram: a `wait` node. Resume from a route with `replyHook.resume(token, payload)` in a file that only routes import.

```ts
import { defineHook, sleep } from "workflow";
import { z } from "zod";

export const replyHook = defineHook({ schema: z.object({ text: z.string() }) });

// In the workflow:
const hook = replyHook.create({ token: `reply:${row.key}` });
const reply = await Promise.race([hook, sleep("1d").then(() => null)]);
if (!reply) throw new Error("No reply within a day");
```

## Child runs

Every workflow passes `fanOut` to `runRows` with its own function: above `chunkSize` rows the run splits the list into child runs of itself, four at a time, each with its exact share of the caps, and adds up their totals. Nothing else to write; the parent is one run with one result. Diagram: the loop's closing node says `more than 100 rows run as child runs`.

```ts
return runRows({
  rows: input.rows ?? defaultInput.rows,
  table: "exampleScores",
  step: scoreRow,
  maxRows: input.maxRows ?? MAX_ROWS,
  maxSpendUsd: input.maxSpendUsd ?? MAX_SPEND_USD,
  estimateUsd: ESTIMATE_USD,
  freshForMs: FRESH_FOR_MS,
  fanOut: { workflow: exampleScores, input, chunkSize: 100 },
});
```

## Inbound webhooks

A workflow that starts from an outside event exports an intake; the route at `POST /api/intake/<slug>` verifies the signature over the raw body, drops redeliveries by event id for 30 days, maps the event to one row, and starts one run. The sender's signing secret lives on the workflow project under the named variable; the link route lists it when present.

```ts
import { defineIntake } from "../lib/intake";

/** Cal.com booking created: one run per booking, keyed by the attendee's email. */
export const intake = defineIntake<{ triggerEvent: string; payload: { uid: string; attendees: { email: string; name: string }[] } }>({
  secretEnv: "CAL_WEBHOOK_SECRET",
  signature: { header: "x-cal-signature-256", algorithm: "sha256", encoding: "hex" },
  eventId: (e) => e.payload.uid,
  toRow: (e) => (e.triggerEvent === "BOOKING_CREATED" && e.payload.attendees[0] ? { key: e.payload.attendees[0].email, name: e.payload.attendees[0].name } : null),
});
```

Register it: `"<slug>": { run, defaultInput, intake }` in `workflows/index.ts`. Verified locally with an HMAC-signed body: 202 with the run id, 200 `{ duplicate: true }` on redelivery, 401 on a bad signature, 200 `{ ignored: true }` when `toRow` returns null.

## Reaching a person

A run reaches a person only through the GTM agent, which owns Slack. `notify` posts to the agent's notify route, and the route posts the text straight to the channel with the agent's bot token: no model runs, so volume is free. Approvals inside an agent stage notify by themselves. Needs `GTM_AGENT_URL` and `GTM_NOTIFY_SECRET` on the workflow project.

```ts
import { notify } from "../lib/notify";

/** Where this workflow talks to people; the answer to the channel question at Create. */
const NOTIFY = { channelId: "C0BSS68KE0P" };

// Per-row news: runRows posts it, deterministically. every: "row" | "chunk" | "run".
const result = await runRows({
  rows, table: "scores", step: scoreRow, maxRows, maxSpendUsd, estimateUsd, freshForMs,
  notify: { target: input.notify ?? NOTIFY, every: "chunk", line: (row, c) => `${row.key}: ${c.score}` },
});

// Workflow scope, after the loop, for something the totals do not say:
await notify({ kind: "show", text: `Top match ${best.key} at ${best.score}.`, target: input.notify ?? NOTIFY });
```

`every` is a count, never a judgment: `row` is one post per finished row; `chunk` is one post per run of rows, so one per child when a run fans out; `run` is one post with the totals when the whole run ends, children silent. Posts land top-level in the channel; a run started from a conversation does not post back into it.

On an agent stage: `notify: input.notify ?? NOTIFY` posts its approval requests there; `notify: false` keeps them silent.

A post that carries something to open or scan may add Slack Block Kit `blocks` next to `text`: a `markdown` block for prose, one `actions` block of `button` elements with a `url` (View on Reddit, Open data; five at most), a `section` with `fields` for a result. The text stays the plain fallback and says everything the blocks say. Plain text whenever that is all the post needs.

```ts
await notify({
  kind: "show",
  text: `Top match ${best.key} at ${best.score}. Open data: ${dataUrl}`,
  blocks: [
    { type: "markdown", text: `**Top match** ${best.key} at ${best.score}.` },
    { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Open data" }, url: dataUrl }] },
  ],
  target: input.notify ?? NOTIFY,
});
```

Kinds: `tell` (news) and `show` (results) are plain posts. `ask` (carries `approval: { token }`) and `handoff` post a message whose thread the agent watches: a person's reply there wakes the agent, which decides the approval through the approve route or steers the run.

## Run attributes

`runRows` already tags every run with `workflow`, `rows`, `channel`, and `parent`. Add more the same way, in workflow scope, string values only, at most 64 keys.

```ts
import { setAttributes } from "workflow";

await setAttributes({ icp: "lean-b2b-saas" });
```

## Web search inside an agent stage

`web: { search: true }` is enough. It is a provider-executed tool, run by AI Gateway inside the model call, so it needs no key and appears inside the `doStreamStep` step rather than as a step of its own; `"openai"` swaps in OpenAI's own search for openai/* models. For any other provider-executed tool, pass it through `tools.custom` the same way; only step-backed tools can be approved or call-limited.

```ts
import { openai } from "@ai-sdk/openai";

tools: { web: { search: "openai" }, custom: { code: openai.tools.codeInterpreter({}) } }
```
