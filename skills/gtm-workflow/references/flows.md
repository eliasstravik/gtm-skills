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
**Where and when should this workflow run?**

1. On this computer, whenever I ask it to run (Recommended)
2. In a connected app
3. Automatically on a schedule or when something happens
4. Cancel

Reply with a number, or type your answer.
```

The first choice selects a provisional `Local` target from `templates/target-local.md` and the contract ignore lines. The agent chooses its implementation from that target prose; there is no registry-less mode. During create, continue through design, build, and validation without a separate setup approval, then include the registry, ignore rules, record, and implementation in one concise proposal and one history entry. For another lifecycle request, finish setup first. A scheduled or triggered request cannot choose Local. Offer a connected app or automatic service, or an on-demand Local workflow invoked on a cadence by the user's scheduler. Scheduling remains outside the local workflow.

## Setup

1. Resolve the workspace and owner node, state the context line, and read only that node's existing registry and records.
2. Inventory available tools, connections, and relevant repos without exposing secrets or naming implementation products in the default conversation. Ask `**Where and when should these workflows run?**` only for missing intent; offer runs on this computer, a discovered connected app, and an automatic scheduled or triggered service as applicable.
3. For each candidate, verify author, run, and inspect access. Explain plainly when an invoke-only or data-only tool is a connection rather than a target.
4. Infer authoring, validation, testing, go-live, inspection, data location, and credential mechanics from the selected target and its documentation. Ask only for missing operating decisions from `conversation.md`, grouping compatible gaps into one compact question. Ask separately when an external write, permission, or material cost needs its own gate.
5. Ask `**Which target should be the default?**` when more than one viable target exists. A “create a target” request joins here; re-running setup extends rather than replaces accepted entries unless requested.
6. Render `WORKFLOWS.md` with named targets, connections, limits, one default, and the applicable ignore lines. Inspect the complete draft internally, show the concise proposal from `conversation.md`, and run the contract accept loop.
7. Save the accepted draft and close with where workflows run, connected systems, limits, affected paths, and “saved to history.” Offer developer details only on request.

## Create

1. Resolve the owner before reading workflow artifacts. When the registry is missing, select a provisional target through the missing-registry branch and combine its registry and ignore rules with the workflow's eventual proposal and accepted write.
2. Resolve the requested kind before rendering any target choice. For scheduled or triggered work, exclude Local from the choices and explain that it supports on-demand only. Offer both a viable infrastructure or app target and an on-demand local workflow invoked by the user's scheduler; scheduling stays outside that workflow. Never offer or recommend Local and then retract it. Otherwise resolve a named target or ask `**Where should this workflow live?**`, listing the viable default first as `(Recommended)`.
3. Extract purpose, inputs, result, timing, systems changed, volume or cost limit, and meaningful failure behavior from the request and registry. Ask only for missing decisions that materially change the workflow. Combine compatible gaps into one compact business question. When a provider is missing, extend connections through the setup-style interview before the workflow build.
4. Build the workflow in target-native draft or scratch space, using installed backend skills and the target's discovery surface. For Local, keep rows, provider calls, retries, and intermediate data inside the script and SQLite; only summaries and results enter the agent conversation. Reuse a thin tracked `workflows/lib/<connection>.ts` wrapper when provider calls have become common across workflows. Validate before continuing. Do not create an in-skill adapter or guess absent operations.
5. Run a target-native test or pilot when useful, obtain the real target pointer for the internal record, and draft `WORKFLOW.md`. For local, also finish the tracked scripts, schemas, tests, and fixtures.
6. Inspect the real record and every tracked local script, schema, test, and fixture internally. Verify the actual diff, then show the behavior, affected systems, timing, limits, failure behavior, validation, path list, and resulting state. Refer to the workflow by name rather than exposing its target pointer, credential pointer, or implementation setting. Do not print implementation or complete file contents unless the user asks for technical details. Run the accept loop.
7. After acceptance, save exactly the proposed bytes to history. Never continue with an unsaved target artifact.
8. Follow the target's go-live prose as a separate gate when consequential. Request and verify any required user action. If deferred, state the exact draft/live split, how to finish, and that live still runs old logic where applicable.
9. Close with what the workflow now does, where it runs, what it may change, validation, path set, live/draft state, and “saved to history.” Keep target pointers under optional technical details.

If the user cancels after target draft creation, ask `**Should I remove the abandoned target draft?**`, offer cleanup first as `(Recommended)` and keep it second, then use the exact reply line. Refer to the draft by workflow name unless an identifier is needed for disambiguation. A cancelled record proposal leaves no tracked bytes.

## Update

1. Resolve the node and named workflow, target, connection, or limits entry. If ambiguous, list only node-local candidates and ask which one to update.
2. Dereference workflow records through target prose. For a registry edit, preserve unrelated entries and re-run target viability when capabilities changed.
3. Agree the requested changes, then edit and validate in target-native draft space. For a registry-only change, draft revised config directly. A bare publish, activate, or make-live request has no content change and skips to step 6.
4. Obtain revised target identifiers when needed. Inspect complete before and after records, config, and every changed local implementation file internally. Show the concise behavior and path proposal from `conversation.md` without exposing target or credential pointers, then run the accept loop.
5. Save exactly the accepted tracked bytes and describe them as “saved to history.” Offer cleanup if cancellation strands a target draft.
6. Run the same target go-live gate as create. Ask for and verify unavailable user actions. On deferral, say what remains draft, how to finish, and that the live version still runs the old logic on draft/publish targets.
7. Close with the operating change, validation, path set, and live/draft state. Keep implementation detail optional.

## Inspect

### One workflow

1. Resolve the node and record, dereference its target, and use only target-native read operations.
2. Report live or draft state, validation, recent business outcomes, connected systems, limits, and relevant cost without mutation. For Local, read the saved run and item state, then lead with outcomes and failures by cause and provider. When target state has only diagnostic IDs, status, and cost, omit the IDs and summarize the count by status and cost; say which business outcome details are unavailable. Keep the record pointer, local storage product, and diagnostic identifiers under optional technical details.
3. For “show me the workflow,” derive a four-to-eight-node business-process Mermaid diagram from the saved implementation and use the caption and failure-note rules in `conversation.md`. A technical control-flow diagram requires an explicit request. If the user asks to retain either diagram in `WORKFLOW.md`, route that tracked change through Update.
4. For “open saved results” or “open workflow data,” use the target's existing viewer and lead with `Open saved results: <human-readable link>`. Say whether the link is local or private. Hide viewer product, storage mode, port, raw path, and stop command unless the user asks for technical details. For a private share, state who can access it and offer to stop sharing later.
5. Distinguish unavailable information from healthy state; never repair during a named-workflow inspect.
6. When the user explicitly requests developer details, identify requested facts under `Tracked implementation` and `Ignored run state` as applicable, then include only the requested technical depth.

### Node health

1. With no workflow argument, inspect the resolved node's registry, records, tracked files, target pointers when safely readable, and `.gitignore` without mutation.
2. Report healthy checks and every defect: orphan target artifacts visible through configured inspection, records with missing target sections or pointers, dangling connections, targets that fail author/run/inspect viability, local kinds beyond on-demand, tracked working state, and missing or duplicated ignore lines. Treat an absent registry on a node with no workflow content as setup-needed, not healthy.
3. If healthy, change nothing and close with the complete report.
4. If defective, group all owned fixes into one scoped repair. Inspect every replacement internally, show the defects, behavior change, affected paths, recovery, and any separate target-side repair requiring a go-live gate, then run the accept loop.
5. Apply only accepted repairs, save once as `Repair GTM workflow artifacts`, rerun every check, and close with resulting health and “saved to history” without naming the branch. `gtm-workspace` remains responsible only for structural defects outside `workflows/`.

## Delete

### Workflow

1. Resolve the node and record, dereference its target, inspect current target state, and explain recovery available from workspace history and the target. Refer to the workflow by name in the default consequence report; keep its target pointer internal.
2. Ask `**What should be deleted?**` with target artifact plus record first as `(Recommended)`, record only second, and cancel last. For record-only, state before acceptance: `<target> workflow keeps running but is no longer tracked here.`
3. Preview the exact target consequence and record or local tracked-file deletion in plain language. Name the affected paths without printing their contents. Run the accept loop for workspace changes; separately gate destructive target deletion when required.
4. Apply only the accepted choice. Remove the workflow directory only when empty, preserve gitignored run state unless its deletion was also accepted, save tracked deletion to history, and close with what remains and recovery.

### Target or connection

1. Resolve the entry. Before target deletion, scan node-local records and list every workflow still bound to it. Refuse removal until those records are rebound or explicitly deleted/unmanaged.
2. Before connection deletion, identify workflows or targets whose prose still depends on it and preview the resulting limitation.
3. Inspect complete before and after `WORKFLOWS.md` internally. Show the affected connections, limits, bindings, and path through the accept loop, save exactly the accepted revision, and close with affected bindings and “saved to history.”

## Run

1. Resolve the node and record, dereference its target, inspect saved limits, and use only the target's run/test/pilot operation.
2. Determine scope, records, external writes, destination, and expected cost with target-native estimators or free preview/count operations when available.
3. Local and read-only runs proceed directly. Before an external write or material cost, ask `**Would you like to run this scope?**`, show records, writes, destination, estimate, limits, and choices for a small target-native pilot first `(Recommended)`, full accepted scope, or cancel. End with the exact reply line.
4. Execute only the accepted scope. Never publish merely to run unless target prose requires a live path and that go-live was separately accepted.
5. Lead with the business result and the explicit form `<n> completed, <m> failed`, followed by the result or `Open saved results` link. State external systems changed, partial failures, limit enforcement, and relevant observed cost. Say `saved locally` for local results. Keep target run pointers, storage details, and telemetry under optional technical details. Write no tracked run log; local state and outputs remain under ignored paths.

## Runtime and persistence boundaries

- Missing target tooling degrades only when its template says so: Clay may use guided manual steps; otherwise update target prose through setup or stop unsupported work.
- If the environment cannot durably save, preserve the workspace and use contract recovery. Clean up or explicitly account for any target draft before closing.
- Workspace lifecycle and structure defects hand off to `gtm-workspace`; ICP, persona, account-research, and lead-research outcomes hand off before workflow reads or mutation.
