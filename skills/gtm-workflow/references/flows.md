# GTM workflow lifecycle flows

Apply the selected flow after loading `contract.md`.

## Contents

- [Guided menu](#guided-menu)
- [Missing registry](#missing-registry)
- [Setup](#setup)
- [Create](#create)
- [Update](#update)
- [Inspect](#inspect)
- [Delete](#delete)
- [Run](#run)
- [Runtime and persistence boundaries](#runtime-and-persistence-boundaries)

## Guided menu

When no lifecycle verb is clear, explain that a workflow is a saved automation bound to one node-local operating target, then render this exact block and continue into the selected flow:

```text
**What would you like to do with your GTM workflows?**

1. Set up workflow targets and connections (Recommended)
2. Create a workflow
3. Update or publish a workflow
4. Inspect workflows
5. Delete a workflow, target, or connection
6. Run a workflow

Reply with a number, or type your answer.
```

## Missing registry

Before create, update, inspect, delete, or run at a node without `workflows/WORKFLOWS.md`, ask:

```text
**How would you like to set up workflows for this organization?**

1. Use the quick local TypeScript + SQLite target (Recommended)
2. Set up targets and connections through the full interview
3. Cancel

Reply with a number, or type your answer.
```

Quick local setup renders `templates/WORKFLOWS.md` with `templates/target-local.md` and the contract ignore lines. Include these actual bytes in the first operation's accepted proposal; there is no registry-less mode. A scheduled or triggered request cannot choose local: offer an infrastructure or app target, or an on-demand local workflow invoked on a cadence by the user's agent-harness scheduler. Scheduling remains outside the local workflow.

## Setup

1. Resolve the workspace and owner node, state the context line, and read only that node's existing registry and records.
2. Inventory available CLIs, installed skills, MCPs, APIs, remotes, and relevant repos without exposing secrets. Ask `**Where should these workflows live?**` only for missing intent; offer discovered viable surfaces first and local as the fallback.
3. For each candidate, verify author, run, and inspect access. Explain plainly when an invoke-only or data-only tool is a connection rather than a target.
4. Ask one question at a time for missing required-operation facts: author/validation, test/pilot, go-live actor and draft semantics, inspection, data location, cost estimation, and credentials. Discover target-native help or installed documentation rather than inventing commands.
5. Ask `**Which target should be the default?**` when more than one viable target exists. A “create a target” request joins here; re-running setup extends rather than replaces accepted entries unless requested.
6. Render `WORKFLOWS.md` with named targets, connections, limits, one default, and the applicable ignore lines. Begin the complete proposal with `**Would you like to save this proposal?**` and run the contract accept loop.
7. Save accepted bytes and close with node, target names, connection names, default, limits, paths, and “saved to history.”

## Create

1. Resolve the owner before reading workflow artifacts. Materialize a missing registry through the missing-registry branch.
2. Resolve the requested kind before rendering any target choice. For scheduled or triggered work, exclude Local from the choices and explain that it supports on-demand only. Offer both a viable infrastructure or app target and an on-demand local workflow invoked by the user's agent-harness scheduler; scheduling stays outside that workflow. Never offer or recommend Local and then retract it. Otherwise resolve a named target or ask `**Where should this workflow live?**`, listing the viable default first as `(Recommended)`.
3. Agree purpose, kind, inputs, outputs, connections, limits, and failure behavior in ordinary conversation. When a provider is missing, extend connections through the setup-style interview before the workflow build.
4. Build the workflow in target-native draft or scratch space, using installed backend skills and the target's discovery surface. For Local, keep rows, provider calls, retries, and intermediate data inside the script and SQLite; only summaries and results enter the agent conversation. Reuse a thin tracked `workflows/lib/<connection>.ts` wrapper when provider calls have become common across workflows. Validate before continuing. Do not create an in-skill adapter or guess absent operations.
5. Run a target-native test or pilot when useful, obtain the real target pointer, and draft `WORKFLOW.md`. For local, also finish the tracked scripts, schemas, tests, and fixtures.
6. Begin `**Would you like to save this proposal?**`; preview the exact record path and complete real record bytes. For local, preview every tracked script, schema, test, and fixture path and complete bytes in the same proposal. Run the accept loop.
7. After acceptance, save exactly the proposed bytes to history. Never continue with an unsaved target artifact.
8. Follow the target's go-live prose as a separate gate when consequential. Request and verify any required user action. If deferred, state the exact draft/live split, how to finish, and that live still runs old logic where applicable.
9. Close with qualified label, target and pointer, validation, path set, live/draft state, and “saved to history.”

If the user cancels after target draft creation, ask `**Should I remove the abandoned target draft?**`, offer cleanup first as `(Recommended)` and keep it second, then use the exact reply line. A cancelled record proposal leaves no tracked bytes.

## Update

1. Resolve the node and named workflow, target, connection, or limits entry. If ambiguous, list only node-local candidates and ask which one to update.
2. Dereference workflow records through target prose. For a registry edit, preserve unrelated entries and re-run target viability when capabilities changed.
3. Agree the requested changes, then edit and validate in target-native draft space. For a registry-only change, draft revised config directly. A bare publish, activate, or make-live request has no content change and skips to step 6.
4. Obtain revised target identifiers when needed. Begin `**Would you like to save this proposal?**`; show complete before and after record or config bytes plus every changed tracked local implementation byte, then run the accept loop.
5. Save exactly the accepted tracked bytes and describe them as “saved to history.” Offer cleanup if cancellation strands a target draft.
6. Run the same target go-live gate as create. Ask for and verify unavailable user actions. On deferral, say what remains draft, how to finish, and that the live version still runs the old logic on draft/publish targets.
7. Close with qualified label or registry entry, exact change, validation, path set, and live/draft state.

## Inspect

### One workflow

1. Resolve the node and record, dereference its target, and use only target-native read operations.
2. Report the saved record pointer, draft/live state, validation state, recent run state available from the target, connections, limits, and observed cost without mutation. For Local, read the `runs` table and per-row `status`, `error`, and `provider` fields, then summarize outcomes and failures by cause and provider; per-row faceting remains available through the registry's SQLite-viewing prose.
3. For “show me the workflow,” regenerate a Mermaid stage flowchart from the saved script and show it without mutation. If the user asks to retain it in `WORKFLOW.md`, route that tracked-byte change through Update.
4. Distinguish unavailable information from healthy state; never repair during a named-workflow inspect.

### Node health

1. With no workflow argument, inspect the resolved node's registry, records, tracked files, target pointers when safely readable, and `.gitignore` without mutation.
2. Report healthy checks and every defect: orphan target artifacts visible through configured inspection, records with missing target sections or pointers, dangling connections, targets that fail author/run/inspect viability, local kinds beyond on-demand, tracked working state, and missing or duplicated ignore lines. Treat an absent registry on a node with no workflow content as setup-needed, not healthy.
3. If healthy, change nothing and close with the complete report.
4. If defective, group all owned fixes into one scoped repair. Begin `**Would you like to save this proposal?**`, preview every path operation and complete replacement byte, and state separately any target-side repair requiring a go-live gate.
5. Apply only accepted repairs, save once as `Repair GTM workflow artifacts`, rerun every check, and close with resulting health and “saved to history.” `gtm-workspace` remains responsible only for structural defects outside `workflows/`.

## Delete

### Workflow

1. Resolve the node and record, dereference its target, inspect current target state, and explain recovery available from workspace history and the target.
2. Ask `**What should be deleted?**` with target artifact plus record first as `(Recommended)`, record only second, and cancel last. For record-only, state before acceptance: `<target> workflow keeps running but is no longer tracked here.`
3. Preview exact target consequence and record/local tracked-file deletion. Run the accept loop for workspace bytes; separately gate destructive target deletion when required.
4. Apply only the accepted choice. Remove the workflow directory only when empty, preserve gitignored run state unless its deletion was also accepted, save tracked deletion to history, and close with what remains and recovery.

### Target or connection

1. Resolve the entry. Before target deletion, scan node-local records and list every workflow still bound to it. Refuse removal until those records are rebound or explicitly deleted/unmanaged.
2. Before connection deletion, identify workflows or targets whose prose still depends on it and preview the resulting limitation.
3. Show complete before and after `WORKFLOWS.md` bytes through the accept loop, save exactly the accepted revision, and close with affected bindings and “saved to history.”

## Run

1. Resolve the node and record, dereference its target, inspect saved limits, and use only the target's run/test/pilot operation.
2. Determine scope, records, external writes, destination, and expected cost with target-native estimators or free preview/count operations when available.
3. Local and read-only runs proceed directly. Before an external write or material cost, ask `**Would you like to run this scope?**`, show records, writes, destination, estimate, limits, and choices for a small target-native pilot first `(Recommended)`, full accepted scope, or cancel. End with the exact reply line.
4. Execute only the accepted scope. Never publish merely to run unless target prose requires a live path and that go-live was separately accepted.
5. Report completed and failed records, external writes, target-native run pointer, observed cost, limit enforcement, and retryable failures in chat. Write no tracked run log; local state and outputs remain under ignored paths.

## Runtime and persistence boundaries

- Missing target tooling degrades only when its template says so: Clay may use guided manual steps; otherwise update target prose through setup or stop unsupported work.
- If the environment cannot durably save, preserve the workspace and use contract recovery. Clean up or explicitly account for any target draft before closing.
- Workspace lifecycle and structure defects hand off to `gtm-workspace`; ICP, persona, account-research, and lead-research outcomes hand off before workflow reads or mutation.
