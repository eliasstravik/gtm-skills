# GTM workflow actions

Load `contract.md`, then apply one action. Reuse decisions already supplied by the user.

## Contents

- [Guided menu](#guided-menu)
- [Bootstrap](#bootstrap)
- [Create](#create)
- [Update](#update)
- [Inspect](#inspect)
- [Delete](#delete)
- [Run](#run)
- [Sandbox branches](#sandbox-branches)
- [Recovery](#recovery)

## Guided menu

When no action is clear, ask:

```text
**What would you like to do with your GTM workflows?**

1. Create a workflow (Recommended)
2. Update a workflow
3. Inspect workflows
4. Delete a workflow
5. Run a workflow
6. Open the workflow tools

Reply with a number, or type your answer.
```

## Bootstrap

Bootstrap during the first create and keep the draft outside the repository until acceptance.

1. Require Node.js 22 and `npm`; the scaffold pins this range in `package.json` and `.nvmrc`.
2. Copy `templates/` into draft `workflows/`, renaming `gitignore` and `vercelignore` with leading dots.
3. Run `npm ci` in the draft and run the baseline `db:migrate` only after acceptance.
4. Create a fresh `GTM_RUN_SECRET` in ignored `.env` after acceptance. Never print it.
5. Add only the requested workflow, its table, and any adapter it needs.

## Create

1. Resolve workspace, owner, and kind. Read the owner's relevant ICP and persona files.
2. Compare the headered template version before editing an existing project. Offer a v3 recopy when needed.
3. Resolve where it runs. For on-demand work, recommend this computer. For scheduled or webhook work, recommend Vercel. Explain that local scheduled work runs only when invoked and model calls on Vercel use the user's budgeted Gateway key.
4. Resolve the purpose, explicit input shape, stable row key, result columns, paid stages, adapter docs, caps, timing, approval stages, checkpoint, and external writes.
5. When the workflow needs a provider, read [providers](providers.md), write its adapter against the user's own credential, and test it against fixtures. The skill ships no adapter catalog.
6. Declare the result table and derive the model-facing business schema with drizzle-zod inside the agent step. Add `key` and `updatedAt` only when saving.
7. Write the workflow from the contract skeleton. Add `scheduledInput` and a matching `vercel.json` entry for scheduled work. Offer `createWebhook()` only for a triggered workflow that runs on Vercel.
8. Check basename-to-export, row input, reachability, caps before spend, `maxRetries = 0`, save before checkpoint, and terminal `updateRun`.
9. Run `npm run gtm -- check`. Run `gtm run --dry-run` against the accepted input. A fresh table is not required for this dry run.
10. Present one save proposal containing behavior, table and key, stages, dry-run output, caps, checkpoint, external writes, migration files to be generated, deployment state, and affected file groups.
11. On acceptance, copy the draft into the workspace, run `npm ci`, then `db:generate` and `db:migrate`. Inspect the generated SQL. Save the accepted tracked bytes in one commit.
12. If the header says `Runs: on Vercel`, follow [deploy](deploy.md). Otherwise enter the run gate. The first real run defaults to a checkpoint after three rows.

Cancellation before step 11 writes no tracked bytes and no migration.

## Update

1. Resolve the workflow and inspect its header, table, adapter, migrations, schedule, approvals, and deployment state.
2. Compare every headered file with v3. Include any accepted recopy in the proposal.
3. Agree the business change. A run-location switch is an update to the same workflow.
4. Change only the workflow, table, adapter, environment names, cron entry, or deployment metadata required by the request.
5. New columns are nullable or defaulted. For a rename, plan a custom migration and hand-write `ALTER TABLE ... RENAME`. Keep schedule headers, `scheduledInput`, and cron entries aligned.
6. Run `gtm check` and the dry run before the save proposal. Do not generate a migration yet.
7. Present one proposal. On acceptance, run `db:generate` and `db:migrate`, inspect the SQL, and save the batch. If behavior changed, enter the checkpointed run gate.
8. Deploy when the accepted header says `Runs: on Vercel`.

## Inspect

Inspection is read-only.

Scan canonical definitions under `workflows/**/*.ts`.

For one workflow, report purpose, location, kind, schedule, table and key meaning, adapter names, caps, approvals, checkpoint use, recent `workflow_runs`, paid-call totals and cache hits from `enrichment_runs`, and deployment state. Use `npm run gtm -- query` for database facts and the Workflow CLI for step history.

For all workflows, also report:

- table declarations that no workflow imports;
- workflow tables missing `key` or `updated_at`;
- basename, export, header, route, cron, and header-version drift;
- fixed schema, adapter, or route files that differ from the current template version.

Do not run migration generation as an inspection check.

For `show me the workflow`, render one Mermaid node per operator-named step in workflow order and show the row-loop edge. Hide schemas, database writes, model settings, bookkeeping, and telemetry.

For a run, use `npm run gtm -- runs get <runId|runKey>` and `gtm query` for its row, ledger entries, and business rows. Results stay in the database and are not copied to JSON.

## Delete

1. Resolve the workflow and inspect its schedule, table, rows, adapter sharing, deployment state, and history recovery.
2. Preview removal of the workflow file and matching cron entry. Keep its result table and rows by default.
3. If the user also wants the table removed, show the row count and require a separate destructive choice. The accepted drop uses a generated migration and never `db:push` or force.
4. Present the deletion proposal. On acceptance, remove only selected files and cron entries. Generate and apply a drop migration only when separately accepted.
5. Remove empty nested workflow directories and an empty `vercel.json`. Keep shared adapters, fixed tables, the deployment project, and unrelated workflows.
6. Validate, save, and report what remains and how history restores source deletion. Schema and data do not roll back with source.

## Run

1. Resolve the workflow and explicit `--input` file. A scheduled workflow also requires `--input`; write `scheduledInput` to an ignored file for a manual run.
2. Refuse `--checkpoint` for scheduled work. Refuse local start or server reuse while `.env.local` exists.
3. For local work, start or reuse the server through [open](open.md). For Vercel, use the recorded production URL.
4. Run:

```text
npm run gtm -- run <slug> --input <file> --dry-run
```

5. Show rows, stages, projected cost, caps, external writes, and checkpoint position. State that dry run calls no provider or model.
6. Ask:

```text
**Would you like to run this scope?**

<dry-run output, external writes, and checkpoint position>

1. Run with a checkpoint after 3 rows (Recommended)
2. Run the full accepted scope
3. Cancel

Reply with a number, or type your answer.
```

Omit option 1 for scheduled work. If the user chooses full scope, start without a checkpoint.

7. Start with `npm run gtm -- run <slug> --input <file> --checkpoint 3 --wait`. The command returns on a terminal state or a wait.
8. At a checkpoint or approval, report the saved rows, failures, spend, remaining projection, table, and exact inspection command. Ask the user to approve, deny, or comment. Continue the same run with `npm run gtm -- approve <token> --yes --wait` only after their answer.
9. If start returns `run_in_progress`, report the existing run key and do not retry. Inspect it. Use the cancel and reconcile recovery only when the operator chooses to abandon it.
10. Report completed, failed, rows written, cache hits, vendor cost, model cost, and external changes. Costs for backends without reported billing are projections.

Row selection composes two commands:

```text
npm run gtm -- query --sql "select * from <table> where ..." --format json > data/rows.json
npm run gtm -- run <slug> --input data/rows.json --dry-run
```

Use `--cloud` on query when selecting from Turso. There is no run filter flag.

## Sandbox branches

When `GTM_SANDBOX=1`:

1. Build a new scaffold under `$HOME/.gtm-scratch/<repo>/workflows/`. Reuse it for the session.
2. Require `TURSO_DATABASE_URL` and `GTM_AGENT_BACKEND=api`. The runtime refuses a file database and CLI backend.
3. Submit tracked bytes through the host approval tool. Run no `git push`, `git fetch`, `git remote`, or other remote Git command.
4. Use no Studio and expose no port. Relay `gtm query --format markdown`, `gtm runs get`, `workflow inspect run`, and `workflow inspect hooks` output.
5. Keep a paused local run and its approval in the same session because a sandbox idle snapshot stops `nitro dev`. Prefer Vercel for approval workflows that must survive.

## Recovery

| Failure | Required response |
| --- | --- |
| `.env.local` exists | Stop local server start or reuse. Name the file and explain that it would select the cloud database. |
| No local model backend | Ask for a supported CLI backend or a budgeted Gateway key. |
| Sandbox CLI backend selected | Set `GTM_AGENT_BACKEND=api` and provide the Gateway credential through the host. |
| Sandbox file URL selected | Supply the workspace Turso URL and token through the host. |
| Duplicate live run | Inspect the returned run key. Do not retry. |
| Zombie `running` or `waiting` row | Run `npx workflow cancel <runId>`, then `npm run gtm -- runs get <runKey>`. |
| Hook no longer pending | Inspect the run. A timed-out or completed hook cannot resume. |
| No Vercel model backend | Add a budgeted Gateway key, then deploy again. |
| Provider or model allowance exhausted | Change the budget or backend, then run only the explicitly selected rows. |
| Table missing at runtime | Stop the server, run the accepted `db:generate` and `db:migrate`, then retry. |
| Local migration is busy | Stop the owned Nitro process and retry `db:migrate` once. |
| Graph or lib change not visible | Restart the owned Nitro process through `open.md`. |
| Persistence unavailable | Leave tracked bytes unchanged and offer keyboard recovery. |
