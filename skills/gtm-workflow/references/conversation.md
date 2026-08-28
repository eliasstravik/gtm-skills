# GTM workflow conversation standard

Use the operator's business language unless technical detail changes cost, permission, safety, ownership, or behavior. Answer what the workflow does, what it reads or changes, when it runs, where results go, and how partial failure appears.

Read the request and managed files before asking. Ask only for a missing decision that changes the result. Gate cost, external delivery, deployment, destruction, a missing run location, and tracked saves. Group compatible gaps.

## Questions

Begin a question-bearing message with one bold question. Put status and explanation below it. Use numbered options with at most one `(Recommended)`, then end the choice block exactly:

```text
Reply with a number, or type your answer.
```

A free-form follow-up may omit numbered options. End the external-destination follow-up with `Tell me the destination.`

## Save gate

Use one save gate for each coherent batch of tracked changes. After acceptance, save the accepted bytes without asking again. Inspect the full draft and actual diff before presenting:

```text
**Would you like to save these changes?**

<behavior, inputs, table and key, paid stages, outputs, external changes, run location, timing, dry-run rows and projected cost, caps, checkpoint, migration, failure behavior, validation, affected file groups, and resulting state>

1. Accept and save (Recommended)
2. Change it
3. Cancel

Reply with a number, or type your answer.
```

Keep source, schemas, configuration bodies, diffs, and complete files out of the default proposal, except that any migration beyond additive `CREATE TABLE` or `ADD COLUMN` must show its full SQL. Name generated migration files after acceptance. Show requested technical detail without weakening a gate.

When any affected workflow says `Runs: on Vercel`, the proposal must say that acceptance commits the batch to `main` and starts a production Vercel deployment. Report the immediate result as `deploying`; call it `live` only after the production deployment endpoint reports the exact returned commit SHA.

A change response asks `**What would you like me to change?**`, updates the draft, reruns validation, and presents one revised proposal. Cancellation writes no tracked bytes.

## Business diagrams

For `show me the workflow`, run `npm run gtm -- diagram <slug> --format mermaid` and relay it. Use `--run <runKey>` to add `[x]` done, `[!]` failed, `[~]` active, `[ ]` not reached, and paid-step cost. Hide schemas, storage writes, model settings, and telemetry.

Add a short caption with the trigger, inputs or changes, saved result, and partial-failure behavior. Provide technical control flow only when requested.

## Outcome reports

Lead completion with the business result and `<n> completed, <m> failed`. Follow with `found <success> of <success + empty> (<hit-rate>%)`, rows written, table, cache hits, estimate versus actual, vendor and model cost, `reported | fixed | projected` cost sources, external systems changed, and delivery state. When estimate and actual differ by more than 20%, give one reason: cache hits, lower reported cost, or early stop. A projected cost is the accepted ceiling because the backend did not report billing.

At a checkpoint, report `<n> rows done, <m> failed, found <x> of <y> (<z>%), $<a> estimated versus $<b> actual, <cost-source breakdown>, $<c> projected for the remaining rows`, the table inspection command, and the exact approval command. Ask for approval before resuming the same run.

When projected spend exceeds the workflow cap or the operator's stated budget, use this gate verbatim:

```text
**Would you like to run this scope?**

<dry-run output, external writes, checkpoint position, and exceeded cap>

1. Run with a checkpoint after 3 rows (Recommended)
2. Run the full accepted scope
3. Cancel
4. Trim scope to fit the cap

Reply with a number, or type your answer.
```

If the operator chooses 4, propose first N rows or a filter, rerun the dry run, then present the gate again.

Use `completed` only when all accepted work ended normally. Say `stopped` for operator denial, provider authentication or quota hold, or a spend-cap stop; include `stop_reason` and `remaining_keys`. Say `timed out` for an expired approval and `failed at <failed_step>` when step identity is available.

While cancellation is pending, say `<workflow> is cancelling as <runKey>` and that the duplicate guard remains closed. At terminal state, say `<workflow> was cancelled as <runKey>` with rows saved and ledger spend; an already-issued request may have completed before the runtime suspension point.

For a duplicate run, say `<workflow> is already running as <runKey>`. Offer inspection first. If the operator wants to abandon a zombie run, give the one recovery sequence: cancel the SDK run, then reconcile with `gtm runs get`.

Keep ports, process controls, SDK run IDs, project identifiers, environment names, branch names, token counts, and telemetry in internal diagnostics unless requested or needed to disambiguate an action. Keep production bearers, OIDC tokens, and public per-run webhook URLs out of messages and tool results. Approval and trigger tokens merely name the pending stage; trusted controls may still resolve them internally to keep the operator interaction concise. Run keys may appear for inspection or duplicate recovery. Describe clean persistence as `saved to history`.
