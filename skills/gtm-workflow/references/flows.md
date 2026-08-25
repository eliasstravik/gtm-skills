# GTM workflow actions

Load `contract.md`, then apply the selected action. Treat answers already supplied by the user as decided and do not ask them again.

## Contents

- [Guided menu](#guided-menu)
- [Silent bootstrap](#silent-bootstrap)
- [Create](#create)
- [Update](#update)
- [Inspect](#inspect)
- [Open](#open)
- [Delete](#delete)
- [Run](#run)
- [Recovery](#recovery)

## Guided menu

When no action is clear, render this block and continue into the selected action:

```text
**What would you like to do with your GTM workflows?**

1. Create a workflow (Recommended)
2. Update a workflow
3. Inspect workflows
4. Delete a workflow
5. Run a workflow
6. Open the Workflows UI

Reply with a number, or type your answer.
```

## Silent bootstrap

Bootstrap during the first create, inside the same draft and save gate.

1. Require supported `node` and `npm` before writing.
2. Copy `templates/` into root `workflows/`, preserving paths and renaming `gitignore` and `vercelignore` with leading dots.
3. Run `npm ci` inside `workflows/`.
4. Generate `GTM_RUN_SECRET` into ignored `workflows/.env`.
5. Carry the ignored paths from `contract.md` into `.gitignore` without duplicates.
6. Add only the workflow the user requested.

## Create

1. Resolve workspace, owner, and kind. Read the owner's relevant ICP and persona files as authoring inputs.
2. Bootstrap in draft space when the project is absent.
3. Ask the run-location question unless the user already said where it runs. Put the first block's order on on-demand work and the second block's order on scheduled or triggered work.

```text
**Where should this workflow run?**

When this workflow uses research, on Vercel that research uses your budgeted Vercel AI Gateway credits rather than your CLI-agent subscription.

1. On this computer (Recommended)
2. On Vercel

Reply with a number, or type your answer.
```

```text
**Where should this workflow run?**

On this computer, a scheduled or triggered workflow runs only when you or your agent asks. When this workflow uses research, on Vercel that research uses your budgeted Vercel AI Gateway credits rather than your CLI-agent subscription.

1. On Vercel (Recommended)
2. On this computer

Reply with a number, or type your answer.
```

4. Resolve purpose, input rows, result fields, external changes, provider and row cost, caps, timing, and meaningful failure behavior.
5. Ask the result-destination question unless the user already supplied the destination.

```text
**Where should each run's results go?**

1. Post them to a web address (Recommended)
2. Somewhere else, tell me
3. Just save them here

Reply with a number, or type your answer.
```

For a scheduled workflow on Vercel, replace option 3 with:

```text
3. Keep them on Vercel; I'll fetch them when you ask
```

For option 1, add `GTM_RESULTS_URL` to `.env.example`, place the supplied value in ignored `.env`, and author a named delivery step. For option 2, add the custom connection and named delivery step.

6. Write the workflow from the contract skeleton with named business steps. Add schedule exports and the matching `vercel.json` entry for scheduled Vercel work.
7. For a triggered workflow, explain that callers use authenticated GET or POST. The user obtains the bearer by opening `workflows/.env`.
8. Validate, build, start or restart the server through `open.md`, and run a three-row pilot when three safe rows exist.
9. Use one proposal and save gate from `conversation.md` for the complete batch.
10. Continue through `deploy.md` when the accepted file says `Runs: on Vercel`. Otherwise report behavior, invocation, results, limits, validation, paths, and saved state.

## Update

1. Resolve the workflow and inspect its header, exports, schedule, connections, and deployment state.
2. Agree the business change. Treat a run-location switch as an update to the same file.
3. Change only the workflow, connection names and values, schedule entry, or allowed deployment metadata required by the request.
4. Keep scheduled headers, `scheduledInput`, workflow initialization, and cron entries in sync. Remove an empty `vercel.json`.
5. Validate and build. Restart through `open.md` and rerun a three-row pilot when behavior changed.
6. Use one proposal and save gate for the batch. Deploy when the accepted header says `Runs: on Vercel`.
7. Report the operating change, validation, paths, result location, and exact local or live state.

## Inspect

For one workflow, read its contract fields and run `./node_modules/.bin/workflow inspect runs`. For deployed state, add `--backend vercel --project <project> --team <team>` from `package.json`. Report purpose, location, kind, schedule, connections, caps, validation, and recent outcomes without mutation.

For all workflows, inspect every managed `flows/**/*.ts` file. Report contract, schedule, connection, route, shared-lib, and deployment drift without repairing it.

For `show me the workflow`, render one Mermaid node per named step in the same order as the UI graph. Split camelCase into spaced labels, so `scoreAccountAgainstIcp` becomes `Score account against ICP`. Include the loop edge. Use the diagram rules in `conversation.md`.

For a selected run result, call the result route with the bearer loaded by the shell. Save a completed result to `data/<slug>/<UTC-date>-<runId>.json`.

For the UI, use open.

## Open

Follow [open](open.md).

## Delete

1. Resolve the workflow and inspect its schedule, result directory, run location, and history recovery.
2. Preview removal of the workflow file and matching cron entry. Keep ignored results and any deployed project unless the user separately accepts their removal.
3. Use the deletion proposal and save gate from `conversation.md`.
4. Remove empty nested flow directories and an empty `vercel.json`. Preserve unrelated workflows and cron entries.
5. Validate, save, and report what remains and how history restores the deletion.

## Run

1. Resolve the workflow and validate explicit input. Use `scheduledInput` when it is the intended manual scope.
2. For local work, start or reuse the server through `open.md`. For Vercel, read the recorded production URL.
3. Render the pre-run statement from `contract.md`, enforce caps, and run a three-row pilot when possible.
4. Before material cost or external writes, use this gate:

```text
**Would you like to run this scope?**

<row count, projected spend, accepted caps, external writes, destination, and pilot outcome>

1. Run the three-row pilot first (Recommended)
2. Run the full accepted scope
3. Cancel

Reply with a number, or type your answer.
```

Omit option 1 after that exact pilot succeeds.

5. POST the accepted body to the run route with the bearer loaded by the shell. Poll the result route for at most ten minutes.
6. If it remains active, report that inspect can fetch it later. Keep the local server running so local work can progress.
7. Save a completed result and report the business outcome, `<n> completed, <m> failed`, result location, external changes, delivery, and observed cost.
8. Retry failed rows only through a new explicit run containing those rows.

## Recovery

| Failure | Required response |
| --- | --- |
| No local agent backend | Ask for a supported CLI agent or a budgeted `AI_GATEWAY_API_KEY` in `.env` |
| No Vercel agent backend | Add a budgeted Gateway key, then deploy again |
| Gateway budget exhausted | Ask the user to raise the key budget or add credits |
| Selected backend cannot restrict web tools | Offer `api` or a run without web tools |
| CLI subscription exhausted | Offer `api`, then rerun only failed rows |
| Unserializable step argument | Pass only plain data into the step; keep the schema and helpers inside it |
| Runs visible, Workflows empty | Use the `open.md` recovery procedure |
| Graph or lib change not visible | Restart the owned Nitro process through `open.md` |
| Hobby cron frequency rejected | Use a daily schedule or a supporting Vercel plan |
| Persistence unavailable | Leave tracked bytes unchanged and offer keyboard recovery |
