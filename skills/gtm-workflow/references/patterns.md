# Patterns: native SDK calls with worked examples

Helpers in `lib/` exist only where a bare SDK call was shown to fail or double-spend. Everything below is a plain Vercel Workflow call the agent writes itself, copied from these examples. The first eight compiled and ran in the scaffold on 2026-09-14; the five after them typecheck against the scaffold and guard the mistakes a first workflow makes, since every step replays after a crash.

Contents: [Retries with backoff](#retries-with-backoff) · [Waiting](#waiting) · [Waiting for an outside event](#waiting-for-an-outside-event) · [Child runs](#child-runs) · [Inbound webhooks](#inbound-webhooks) · [Reaching a person](#reaching-a-person) · [Run attributes](#run-attributes) · [Web search inside an agent stage](#web-search-inside-an-agent-stage) · [Waterfall](#waterfall) · [Asking a person before a step](#asking-a-person-before-a-step) · [Writes to other systems](#writes-to-other-systems) · [Comparing with the last run](#comparing-with-the-last-run) · [One table feeds another](#one-table-feeds-another) · [Names are identity](#names-are-identity)

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

## Waterfall

Several providers can answer the same question. Try them in order and stop at the first hit. Each provider is its own `"use step"` with `maxRetries = 0`, wrapped in `cached()`, and the loop lives in workflow scope: a crash after a paid miss never buys that miss again on replay, and a miss is cached too, so a rerun inside the TTL costs nothing. The row pays for every provider that ran; at some providers a miss still costs. Never put the whole loop in one step. Diagram: one `paid` node per provider in the order tried, each `-- found --> save` and `-- not found -->` the next.

```ts
import { cached, type Priced } from "../lib/cache";

type Email = Priced<{ email: string } | null>;
const MONTH = 30 * 24 * 60 * 60 * 1000;

/** Each provider step calls its API with the user's key and returns { value, costUsd }; null value means no answer. */
async function viaHunter(row: Row): Promise<Email> {
  "use step";
  return cached("hunter.find-email", { domain: row.key, name: row.name }, MONTH, () => hunterFindEmail(row));
}
viaHunter.maxRetries = 0;

async function viaDropcontact(row: Row): Promise<Email> {
  "use step";
  return cached("dropcontact.find-email", { domain: row.key, name: row.name }, MONTH, () => dropcontactFindEmail(row));
}
viaDropcontact.maxRetries = 0;

const PROVIDERS = [["hunter", viaHunter], ["dropcontact", viaDropcontact]] as const;

// Inside step(row), workflow scope:
async function findEmail(row: Row) {
  let costUsd = 0;
  for (const [name, find] of PROVIDERS) {
    const r = await find(row);
    costUsd += r.costUsd;
    if (r.value) return { email: r.value.email, email_source: name, costUsd };
  }
  return { email: null, email_source: null, costUsd };
}
```

Which providers, and in what order, is domain knowledge: it belongs in the ICP, a `skills/` module, or the doc comment, never in `lib/`.

## Asking a person before a step

An agent stage asks by itself through `approve`. A plain step that must wait for a person (enrolling in a sequence, writing to the CRM) reuses the same three pieces, so the same Slack thread, the same agent wake, and the same approve route decide it: `approvalHook` from `lib/approval.ts`, `recordApproval`, and a `notify` post of kind `ask` carrying the token. Never a second hook of your own for approvals; the approve route resumes only `approvalHook`. Diagram: a `wait` node, `Ask before enrolling<br/><small>Slack · free</small>`.

```ts
import { getWorkflowMetadata, sleep } from "workflow";
import { approvalHook, recordApproval } from "../lib/approval";
import { canNotify, notify } from "../lib/notify";

/** Workflow scope: true when a person approved, false when they declined or nobody answered within three days. */
async function askPerson(stage: string, tool: string, input: unknown): Promise<boolean> {
  const token = `approval:${stage}:${JSON.stringify(input)}`;
  const hook = approvalHook.create({ token });
  await recordApproval({ token, runId: getWorkflowMetadata().workflowRunId, stage, tool, input });
  if (canNotify()) await notify({ kind: "ask", text: `${stage} wants to ${tool} ${JSON.stringify(input).slice(0, 600)}`, approval: { token }, target: input_notify });
  const decision = await Promise.race([hook, sleep("3d").then(() => null)]);
  return decision?.approved === true;
}

// Inside step(row):
if (await askPerson("enrollLead", "enroll in the outbound sequence", { email: row.key })) await enroll(row);
else return { enrolled: false, costUsd: 0 };
```

`input_notify` is `input.notify ?? NOTIFY`, the workflow's channel. The token is the approval's identity: build it from the stage and the input, not from `Date.now()`, so a replay finds the same request instead of asking twice. The run's read route lists the request until it is decided.

## Writes to other systems

A step that writes somewhere else (a CRM upsert, a sequence enrollment, an email) costs nothing, so nothing forbids retries; yet a retry after a half-finished call writes twice. Make every such call idempotent: upsert keyed by email or domain, send an `Idempotency-Key` header where the API takes one, or check before writing. When the API offers none of those, set `maxRetries = 0` and let the row's `error` column carry the failure. Diagram: the step's normal node, second line naming the system and `free`.

```ts
async function upsertContact(row: Row, fields: Record<string, unknown>) {
  "use step";
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`, "content-type": "application/json", "Idempotency-Key": `contact:${row.key}` },
    body: JSON.stringify({ inputs: [{ idProperty: "email", id: row.key, properties: fields }] }),
  });
  if (!res.ok) throw new Error(`HubSpot answered HTTP ${res.status}`);
}
upsertContact.maxRetries = 0;
```

## Comparing with the last run

`saveRow` overwrites the row, so a workflow that must notice change reads its own previous columns in a step before it computes the new ones, and keeps the difference as a column of its own. `freshForMs` decides when to look again; it never detects change. Diagram: a free step, `Read last headcount<br/><small>table headcounts · free</small>`, before the paid one.

```ts
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { headcounts } from "../db/tables/headcounts";

async function previous(key: string) {
  "use step";
  const [row] = await db().select().from(headcounts).where(eq(headcounts.key, key));
  return row ?? null;
}

// Inside step(row):
const before = await previous(row.key);
const now = await fetchHeadcount(row.key);
return {
  headcount: now.value,
  previous_headcount: before?.headcount ?? null,
  changed: before ? now.value !== before.headcount : null,
  costUsd: now.costUsd,
};
```

## One table feeds another

A workflow whose rows are another workflow's results reads that table in a step and turns rows into keys; it never nests `runRows`. Per-row fan-out (five people for every company) is the second workflow's job: its table is keyed by the person, with the company as a column, one row each. Diagram: the first node of the second workflow is a free step naming the source table.

```ts
import { gte } from "drizzle-orm";
import { db } from "../lib/db";
import { exampleScores } from "../db/tables/example-scores";

/** Companies that scored 70 or more, as rows for this workflow. */
async function companiesToResearch(): Promise<Row[]> {
  "use step";
  const rows = await db().select().from(exampleScores).where(gte(exampleScores.score, 70));
  return rows.map((r) => ({ key: r.key, score: r.score }));
}

export async function findPeople(input: RowsInput) {
  "use workflow";
  const rows = input.rows ?? (await companiesToResearch());
  return runRows({ rows, table: "people", step: peopleForCompany, /* caps */ fanOut: { workflow: findPeople, input, chunkSize: 100 } });
}
```

## Names are identity

A workflow's slug, its table and column names, and the `name` given to `cached()` are how the runtime finds what it already did. Rename any of them and the next run starts from an empty table or cache and buys every row again. Change a label in the doc comment instead; when a name must change, add the new one, copy the rows in a migration, then drop the old one.
