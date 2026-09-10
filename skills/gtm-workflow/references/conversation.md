# GTM workflow conversation standard

Use the operator's business language unless technical detail changes cost, permission, safety, ownership, or behavior. Answer what the workflow does, what it reads or changes, when it runs, where results go, and how partial failure appears. Questions, approval by surface, and banned language follow the [shared interaction standard](../../gtm-workspace/references/interaction.md); this file adds the workflow-specific proposal content and outcome reports.

Read the request and managed files before asking. Ask only for a missing decision that changes the result. Gate cost, external delivery, production effect, destruction, and tracked saves. Default every other open decision and send at most one decision message per the standard. The run location is asked only on a keyboard, as the decision message's lead question with `hosted, in production` and `on this computer` as its numbered options. On a hosted surface every workflow runs `hosted, in production` and `on this computer` is never mentioned. The product name stays out of user-facing text. No command, tool name, or run identifier appears in user-facing text on any surface; the agent runs commands itself and describes results in words, and a keyboard user may ask for a command and receive it on request.

## Contents

- [Questions](#questions)
- [Save gate](#save-gate)
- [Run gate](#run-gate)
- [Business diagrams](#business-diagrams)
- [Where to look](#where-to-look)
- [Outcome reports](#outcome-reports)

## Questions

For a create or update, send at most one decision message in the standard's shape before any reference reading, scaffolding, or code. Its bullets, one line each, are only: reads (the input and what identifies a row), saves (the tables and how they link), limits (rows, one cost total, when it pauses). Data sources, models, step order, and saved columns are not user decisions; they belong to the gate. Send the message only when a default changes cost, external effects, or what gets saved; otherwise build straight to the gate.

A follow-up that needs a typed fact (a file, a link, a destination) is the lead question with no numbered block. End the external-destination follow-up with `Tell me the destination.`

## Save gate

Use one save gate for each coherent batch of tracked changes. Inspect the full draft and actual diff before presenting. The proposal is the workflow by identity, then one bulleted list with one line each, in words: does (behavior); reads (inputs and the stable row key); runs (where and when); costs (paid stages, projected cost per run, caps, checkpoint); writes (`and its result table` when a table is created; `plus the workflow project's standard files` on the first workflow save; each table change); checked (validation passed, dry-run row count). Add a line for external changes or non-default failure behavior only when present. For an update, state changed facts only, each `was X, now Y`. Keep source, schemas, configuration bodies, diffs, migration file names, and complete files out of the proposal; show requested technical detail on request without weakening a gate. A migration beyond additive `CREATE TABLE` or `ADD COLUMN` is stated as its destructive effect in words, naming the table or column and the number of rows affected; show its SQL on request; the host request still declares `destructive`.

On a keyboard:

```text
**Save this?**

Using GTM workspace: <root display name>

<proposal>

1. Save (Recommended)
2. Change it
3. Cancel

Reply with a number, or type your answer.
```

After acceptance, save the accepted bytes without asking again. A change response asks `**What would you like me to change?**`, updates the draft, reruns validation, and presents one revised proposal. Cancellation writes no tracked bytes.

On a hosted surface with a native approval control, write no proposal message: run `db:generate` in the scratch draft first so the request already carries the SQL, journal, and snapshot, then put the whole proposal in the write control's `summary` as plain text, first line `For <root display name>:`, last line `Approve to save, or Cancel and tell me what to change.`, and make that tool call the only action of the message that carries it. `db:verify` and the ledger check stay inside the host tool.

When any affected workflow runs hosted, the proposal ends its workflow description with `Saving this also puts it live in production.` After the save, say `Saved. I'll follow up here when it's live.` Register the host's deployment watch in the originating thread. It posts `Live.` after the accepted version is ready, or `Not live after 10 minutes. Nothing ran. I'll look into it.` Investigate from the sandbox without a deploy token. An interim status is `Not live yet.`

After `Live.`, automatically propose a one-row real smoke run through the existing start action with checkpoint 1. Preview exactly one row first and state its total cost and every model/provider call and external effect. This is a separate approval from saving. Free checks run immediately; paid work gets one approval for the whole smoke plan, and covered calls never prompt again. Scheduled workflows may use a one-row manual POST smoke run with checkpoint 1; scheduled GET delivery still has no checkpoint. Batch parents use a one-row input without a checkpoint, as required by their execution contract.

When a hosted run is waiting, add before that production sentence: `The waiting run will finish on the previous version; you can ask me to stop it first.` Identify it by workflow name and start time when needed; use the existing cancel gate if requested.

## Run gate

After the read-only preview, the run proposal states rows, stages with each chosen model, projected cost, caps, external writes, and checkpoint position. A local dry run does not check credentials or tables. A trusted hosted preview also calls deployed preflight and reports `credentials and table verified` only on success; otherwise name the missing piece. Free authentication checks call no paid endpoint. For row work, both save and run proposals say `N rows at a time`; when parallel, give the checkpoint's rounded count. For child batches, also state batch count and size, overall deadline, cancellation of active batches, and that an ordinary failed batch does not stop later batches. Batch parents have no row checkpoint: propose a small input first in place of the checkpoint option, then preview full scope separately. On a keyboard:

```text
**Would you like to run this scope?**

Using GTM workspace: <root display name>

<rows, stages, projected cost, caps, external writes, and checkpoint position>

1. Run with a checkpoint after 3 rows (Recommended)
2. Run the full accepted scope
3. Cancel
4. Trim scope to fit the cap

Reply with a number, or type your answer.
```

Show option 4 only when the projection exceeds the workflow cap or the operator's stated budget. Omit option 1 for scheduled work. If the operator chooses 4, propose first N rows or a filter, rerun the dry run, then present the gate again.

On a hosted surface, the whole run proposal goes into the start control's `summary`, first line `For <root display name>:`, last line `Approve to run, or Cancel and tell me what to change.`, with the checkpoint-after-3-rows default, and the tool call is the only action of that turn. "Full scope" and "trim scope" are text replies that lead to a new preview and a new start request.

Approval-gated actions use these closing lines: checkpoint continue `Approve to continue the run, or Cancel to leave it paused and tell me what to do.`; stop a paused run `Approve to stop the run here, or Cancel to leave it paused.`; cancel a live run `Approve to stop the run, or Cancel to leave it running.`

## Business diagrams

For `show me the workflow`, show the generated picture and the "Where to look" block. Every diagram has a one-line summary strip, numbered steps in run order, provider/model and cost per row on paid cards, yes/no decision questions, a save node named for the business table, and a legend for `[x]` done, `[!]` failed, `[~]` active, `[ ]` not reached. Use the named run for status and spend overlays. Keep schemas and telemetry out of the picture.

Add a short caption with the trigger, inputs or changes, saved result, and partial-failure behavior. Provide technical control flow only when requested.

## Where to look

When a host channel combines the final caption, picture, and Diagram/Runs/Data block into one message, that message fulfills this section. Supply only a short workflow caption for the host to include; do not repeat the links or add another block. For a links-only request, the channel message needs no caption.

After a workflow is resolved, the flows in [flows](flows.md#where-to-look-moments) show one block of at most three lines:

```text
Diagram: <signed diagram link>
Runs: <embedded Workflows UI locally, or the Vercel Observability page or run deep link when hosted>
Data: <Drizzle Studio locally, or the Turso dashboard when hosted>
```

Local links are `http://127.0.0.1:3000/gtm/diagram/<path>?…`, `http://127.0.0.1:3000/_workflow`, and the Studio URL printed by `npm run db:studio`. Hosted links are the production diagram link, `https://vercel.com/<team>/<project>/observability/workflows` from the recorded `gtm.vercel` values (or the run's stored run URL for one run), and the Turso dashboard `https://app.turso.tech/<org>/databases/<db>` derived from the `libsql://<db>-<org>.turso.io` database host; when derivation fails, link `https://app.turso.tech`. On a hosted surface label the second line `Runs:`. This block is the only place a host name may appear, per the [shared interaction standard](../../gtm-workspace/references/interaction.md#where-to-look-carve-out).

## Outcome reports

Use one headline line and at most two numbers, for example `Accounts saved. 12 rows, $0.24 spent.` Name a failure or partial external effect in business words when present. Give cache hits, hit rate, estimate versus actual, cost sources, and batch details only on request. If cost is projected, say `estimated` instead of `spent`.

At a checkpoint, use the same headline-plus-two-numbers format. The continuation approval states the remaining plan, calls, effects, total cost, concurrency, and any checkpoint rounding under the approval-text exception. On a hosted surface it is the approve action's `summary` with its required closing line. On a keyboard use:

```text
1. Continue (Recommended)
2. Stop here
3. Show me the saved rows first

Reply with a number, or type your answer.
```

Use `completed` only when all accepted work ended normally. Say `stopped` for operator denial, provider authentication or quota hold, or a spend-cap stop; include the stop reason and how many rows remain. Say `timed out` for an expired approval and `failed at <stage>` when step identity is available.

While cancellation is pending, say `<workflow> is cancelling` and that a second start is held until it finishes. At terminal state, say `<workflow> was cancelled` with rows saved and spend so far; an already-issued request may have completed before the runtime suspension point.

For a duplicate run, say `<workflow> is already running`, naming it by workflow name and start time. Offer to show its progress first. If the operator wants to abandon a stuck run, offer to stop the stuck run and tidy up, then do both. A user refers to a run by workflow name and time ("the account-scoring run from this morning"); the agent resolves the run internally.

Keep ports, process controls, identifiers, environment names, token counts, and telemetry in diagnostics. Keep production bearers, OIDC tokens, and public per-run webhook URLs out of messages and tool results. Background run watches post a report in the originating Slack thread when the run reaches a checkpoint, completes, fails, or is cancelled. Slack threads are one level deep: every update uses the original conversation's thread timestamp, never a reply's timestamp as a new thread. A run report uses its actual outcome, not the save closing.
