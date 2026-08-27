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

Keep source, schemas, configuration bodies, diffs, and complete files out of the default proposal. Name generated migration files after acceptance. Show requested technical detail without weakening a gate.

When any affected workflow says `Runs: on Vercel`, the proposal must say that acceptance commits the batch to `main` and starts a production Vercel deployment. Report the immediate result as `deploying`; call it `live` only after the production deployment endpoint reports the exact returned commit SHA.

A change response asks `**What would you like me to change?**`, updates the draft, reruns validation, and presents one revised proposal. Cancellation writes no tracked bytes.

## Business diagrams

For `show me the workflow`, render one Mermaid node per named business step in workflow order. Split the same camelCase names into spaced labels and show the row-loop edge. Show a branch only for a user choice or materially different outcome. Hide schemas, storage writes, model settings, process state, and telemetry.

Add a short caption with the trigger, inputs or changes, saved result, and partial-failure behavior. Provide technical control flow only when requested.

## Outcome reports

Lead completion with the business result and `<n> completed, <m> failed`. Follow with rows written, table name, cache hits, vendor cost, model cost, external systems changed, and delivery state. Say when a model cost is the accepted projection because the backend did not report billing.

At a checkpoint, report `<n> rows done, <m> failed, $<x> spent, $<y> projected for the remaining rows`, the table inspection command, and the exact approval command. Ask for approval before resuming the same run.

For a duplicate run, say `<workflow> is already running as <runKey>`. Offer inspection first. If the operator wants to abandon a zombie run, give the one recovery sequence: cancel the SDK run, then reconcile with `gtm runs get`.

Keep ports, process controls, SDK run IDs, project identifiers, environment names, branch names, token counts, and telemetry in internal diagnostics unless the user requests them or they safely disambiguate an action. Keep production bearers, OIDC tokens, hook tokens, and per-run webhook URLs out of messages and tool results. Run keys may appear when needed for inspection or duplicate recovery. Describe clean persistence as `saved to history`.
