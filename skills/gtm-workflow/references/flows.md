# GTM workflow lifecycle flows

Apply the selected flow after loading `contract.md`.

## Contents

- [Guided menu](#guided-menu)
- [Silent bootstrap](#silent-bootstrap)
- [Create](#create)
- [Update](#update)
- [Inspect](#inspect)
- [Delete](#delete)
- [Run](#run)
- [Recovery](#recovery)

## Guided menu

When no lifecycle verb is clear, render this exact block and continue into the selected flow:

```text
**What would you like to do with your GTM workflows?**

1. Create a workflow (Recommended)
2. Update a workflow
3. Inspect workflows
4. Delete a workflow
5. Run a workflow

Reply with a number, or type your answer.
```

## Silent bootstrap

Run bootstrap as part of the first create. Do not expose it as a lifecycle verb or ask for separate setup approval.

1. Confirm a supported `node` and `npm` are available. If not, stop before writing.
2. Copy every file from `templates/` into root `workflows/`, preserving paths and copying `gitignore` as `.gitignore` and `vercelignore` as `.vercelignore`. Include the example workflow.
3. Run `npm ci` inside `workflows/`.
4. Generate one strong `GTM_RUN_SECRET` and write it only to ignored `workflows/.env`. Do not print it.
5. Carry every ignored path from `contract.md` in `workflows/.gitignore` without duplicates.
6. Build the requested workflow in the same draft. The first create has one proposal, one acceptance, and one history entry for the scaffold and workflow together.

## Create

1. Resolve the workspace, owner node, and kind: `on-demand`, `scheduled`, or `triggered`. Read the owner node's relevant ICP and persona files at authoring time. These files inform generated code but are not runtime dependencies.
2. Run silent bootstrap in draft space if the project is absent.
3. Always ask the run-location question. For on-demand work, put `On this computer (Recommended)` first. For scheduled or triggered work, put `On Vercel (Recommended)` first. Show both applicable notes once:
   - For scheduled or triggered workflows, on this computer means it runs only when the user or their agent asks.
   - When the workflow calls `agent()`, on Vercel means research uses the user's budgeted Vercel AI Gateway credits rather than their CLI-agent subscription.

Use one of these exact choice orders:

```text
**Where should this workflow run?**

1. On this computer (Recommended)
2. On Vercel

Reply with a number, or type your answer.
```

```text
**Where should this workflow run?**

1. On Vercel (Recommended)
2. On this computer

Reply with a number, or type your answer.
```

4. Resolve purpose, input rows, result fields, external changes, provider endpoint and cost, `MAX_ROWS`, `MAX_SPEND_USD`, `COST_PER_ROW_USD`, timing, and meaningful failure behavior. Ask only for missing business decisions that change the result.
5. Ask where results should go:

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

When the user supplies a webhook, put only its safe value in ignored `.env` as `GTM_RESULTS_URL`. If it contains a credential, have the user place it in `.env` without echoing it. A custom destination requires a custom delivery step and remains subject to the same proposal gate.

6. Write `flows/<owner-path>/<slug>.ts` to the file contract. Root workflows omit `<owner-path>/`. Keep the per-row catch and unconditional delivery step.
7. For `Kind: scheduled`, add the UTC `Schedule:` header, export `scheduledInput`, and place `arg ??= scheduledInput` directly after `"use workflow"`. When it runs on Vercel, add or update this entry in `vercel.json`:

```json
{
  "path": "/api/run/<owner-path>/<slug>",
  "schedule": "<UTC cron expression>"
}
```

Say once that Vercel cron is best effort and may double-fire. On Hobby, it runs at most once per day and may fire within the specified hour.

8. For `Kind: triggered`, explain that the caller sends an authenticated GET or POST to the run route. Tell the user to open `workflows/.env` themselves to obtain the secret. Never display it.
9. Run `./node_modules/.bin/workflow validate`, restart or start `nitro dev`, and run a three-row pilot through the HTTP route when three safe rows exist. Inspect the result through the result route.
10. Review the full draft and actual diff. Show the proposal from `conversation.md`, including scaffold files on first create, workflow behavior, caps, result destination, schedule, validation, and resulting local or deployment state. Run the acceptance block.
11. Save accepted bytes to history on `main`.
12. If `Runs: on Vercel`, continue through [deploy](deploy.md). Otherwise close with what runs, how it is invoked, result location, limits, validation, affected paths, and `saved to history`.

## Update

1. Resolve the managed file by qualified slug and inspect its header, exports, schedule entry, connections, and deployment state.
2. Agree the business change. Switching between `Runs: on this computer` and `Runs: on Vercel` is an update and must preserve the same committed workflow file.
3. Edit only the workflow, `.env.example` names, ignored `.env` values, schedule entry, or allowed `package.json` deployment metadata needed by the change. Never edit `lib/agent.ts` or the routes.
4. When adding a schedule, apply the scheduled file and cron rules from Create. When removing it, remove both `Schedule:` and `scheduledInput`, remove `arg ??= scheduledInput`, and remove the matching cron entry. Remove empty `vercel.json`.
5. Validate, restart `nitro dev` if `lib/` changed during an explicit template upgrade, and rerun a three-row pilot when behavior changed.
6. Inspect the complete draft and diff, show the proposal, accept it, and save exact bytes to history.
7. Use [deploy](deploy.md) when the result says `Runs: on Vercel`. If switching to this computer, do not delete the existing Vercel project unless the user separately accepts that destructive action.
8. Close with the operating change, validation, paths, result location, and exact local or live state.

## Inspect

### One workflow

1. Resolve the workflow file and read its header, input, caps, result schema, provider steps, delivery step, and schedule.
2. For local state, run `./node_modules/.bin/workflow inspect`. For deployed state, read `package.json` `gtm.vercel` and inspect with `./node_modules/.bin/workflow inspect --backend vercel --project <project> --team <team>`.
3. Report purpose, run location, kind and schedule, connected systems, caps, validation, and recent outcomes without mutation.
4. For `show me the workflow`, render the business-process diagram from `conversation.md`. Give technical control flow only when requested.
5. When the user asks for a run's result, call the authenticated result route through the shell, using the secret from `.env` without printing it. This works for a completed local run, deployed run, or a run previously reported as still running. Save a completed result to `data/<slug>/<UTC-date>-<runId>.json` and report it as `saved locally`.

### All workflows

1. Recursively find managed `flows/**/*.ts` files and summarize them by qualified slug.
2. Report missing headers, naming mismatches, cap-order defects, direct side effects, route or `lib/agent.ts` drift, invalid schedules, missing connection names, and deployment metadata problems. Do not repair during inspect.
3. Distinguish absent run data from healthy state.

## Delete

1. Resolve the managed workflow and inspect its schedule, result directory, run location, and history recovery.
2. Preview deletion of the workflow file and its matching cron entry. Ignored results remain unless the user separately asks to remove them. A deployed project remains unless separately accepted.
3. Show affected paths and recovery in the proposal, run the acceptance block, and apply only the accepted deletion.
4. Remove an empty nested flow directory and an empty `vercel.json`; preserve all unrelated workflows and cron entries.
5. Run validation, save the deletion to history, and close with what remains and how history restores it.

## Run

1. Resolve the workflow and validate the explicit input against its exported schema. A scheduled workflow still receives an explicit body for pilot and full manual runs; use its `scheduledInput` value when that is the intended scope.
2. For a local run, confirm `nitro dev` is healthy and start it in the background when needed. For a Vercel run, read the production URL from `package.json` `gtm.vercel`.
3. Count rows before spending. Reject scopes above `MAX_ROWS` or projected spend above `MAX_SPEND_USD`. Calculate projected spend as `rows × COST_PER_ROW_USD`.
4. Run a three-row pilot first when three safe rows are available. Start it by POSTing the explicit body to the authenticated run route and inspect the result through the GET result route.
5. Before a full run with material cost or external writes, use:

```text
**Would you like to run this scope?**

1. Run the three-row pilot first (Recommended)
2. Run the full accepted scope
3. Cancel

Reply with a number, or type your answer.
```

State row count, projected spend, accepted caps, external writes, destination, and pilot outcome before this question. Omit option 1 when that exact pilot has already succeeded.

6. POST every accepted run through `/api/run/<path>` with an explicit body. Substitute the bearer from `.env` in the shell so it never enters conversation, command output, or a tracked file.
7. Poll `/api/runs/<runId>` for at most ten minutes. If still running, say so and explain that inspect can fetch it later. A local run progresses only while the workflow server is up; if interrupted, restart `nitro dev` and the run resumes.
8. On completion, save the returned result to `data/<slug>/<UTC-date>-<runId>.json`. Lead with the business outcome and `<n> completed, <m> failed`. Say `saved locally` with the path and `posted to your web address` when the delivery step posted successfully. Name external systems changed and relevant observed cost.
9. To retry failed rows, make a new explicit run whose input contains only those rows. Never add automatic per-row retries.

## Recovery

| Failure | Required response |
| --- | --- |
| No agent backend on this computer | Ask the user to install one supported CLI agent or add a budgeted `AI_GATEWAY_API_KEY` to `.env` |
| No agent backend on Vercel | Add a budgeted `AI_GATEWAY_API_KEY` to `.env`, then deploy again |
| Gateway budget or credits exhausted | Report the budget error, then ask the user to raise the key budget or top up credits in the Vercel dashboard |
| Selected backend cannot restrict web tools | Offer `GTM_AGENT_BACKEND=api` or a run without web tools |
| CLI-agent subscription exhausted | Offer `api`; after the backend changes, rerun only the failed rows |
| Unserializable step argument | Move schema conversion or other non-plain values outside the step boundary, validate, and rerun |
| Stale bundle after a template upgrade | Restart `nitro dev` after any `lib/` change |
| Hobby cron frequency rejected | Change to a once-daily schedule or use a Vercel plan that supports the requested frequency |
| Persistence unavailable | Leave tracked bytes unchanged, account for draft or deployment state, and offer keyboard recovery |
