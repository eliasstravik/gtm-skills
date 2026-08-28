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
2. Run `gtm check` before editing an existing project. Offer a v10 recopy when headers or content hashes differ; show the diff for every locally modified managed file first.
3. Resolve where it runs. For on-demand work, recommend this computer. For scheduled or triggered work, recommend Vercel. In a sandbox, recommend Vercel for every workflow because the sandbox never starts a real run. Explain that local scheduled work runs only when invoked and hosted model calls use the user's budgeted key.
4. Resolve the purpose, explicit input shape, stable row key, result columns, paid stages, adapter docs, caps, timing, approval stages, checkpoint, and external writes.
5. When the workflow needs a provider, read [providers](providers.md), write its adapter against the user's own credential, and test it against fixtures. The skill ships no adapter catalog.
6. Declare the result table, derive the model-facing business schema inside the agent step, and load the owner's accepted ICP and persona text into `context` with stable file paths in `contextId`. Add `key` and `updatedAt` only when saving.
7. Write row work with `runRows()`. Add `scheduledInput` and matching cron entry for scheduled work. For triggered work, prefer `waitForTrigger()` plus the bearer-protected trigger route; use a public webhook only when the caller cannot send a bearer, and validate its payload in the workflow.
8. Run `npm run gtm -- check`; it enforces export, input, compiler-level workflow, paid-step retry, table, bookkeeping, migration, version, and content-hash rules.
9. Run `gtm run --dry-run` against the accepted input. It validates the Zod schema and caps without spend; a fresh table and working credentials are not required.
10. Present one save proposal containing behavior, table and key, stages, dry-run output, caps, checkpoint, external writes, migration files to be generated, deployment state, and affected file groups.
11. On acceptance, copy the draft into the workspace, run `npm ci`, then `db:generate`. Inspect the generated SQL and its journal and snapshot artifacts. Show full SQL for any non-additive migration. Apply accepted migrations, run `db:verify`, and only then save; a Vercel workflow's one atomic `main` commit starts production deployment.
12. If the header says `Runs: on Vercel`, follow [deploy](deploy.md) and report the commit as deploying. Otherwise enter the run gate. The first real run defaults to a checkpoint after three rows.

Cancellation before step 11 writes no tracked bytes and no migration.

## Update

1. Resolve the workflow and inspect its header, table, adapter, migrations, schedule, approvals, and deployment state.
2. Compare every managed file with v10 by header and recorded hash. Show locally modified diffs and include any accepted recopy in the proposal.
3. Agree the business change. A run-location switch is an update to the same workflow.
4. Change only the workflow, table, adapter, accepted ICP/persona context, environment names, cron entry, or deployment metadata required by the request. Reload context text so its changed content invalidates the model cache.
5. New columns are nullable or defaulted. Use expand/contract for a rename: add, backfill, switch code, then drop after the old deployment is gone. Keep schedule headers, `scheduledInput`, and cron entries aligned.
6. Run `gtm check` and the dry run before the save proposal. Do not generate a migration yet.
7. Present one proposal. On acceptance, run `db:generate`, inspect the SQL, save its registered artifacts together, apply the migration, and run `db:verify`. The approval-gated hosted save verifies hashes before its `main` commit. If behavior changed, enter the checkpointed run gate.
8. A `main` commit deploys when the accepted header says `Runs: on Vercel`; wait for that exact SHA before a real run.

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
3. For local work, start or reuse the server through [open](open.md). For Vercel, use the recorded production URL through the trusted workflow control when it is available.
4. Run the dry run locally, or call the trusted workflow control's preview action when the sandbox cannot hold the production bearer:

```text
npm run gtm -- run <slug> --input <file> --dry-run
```

5. Show rows, stages, projected cost, caps, external writes, and checkpoint position. State that dry run calls no provider or model, does not check table existence, and does not test credentials.
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

7. Start with `npm run gtm -- run <slug> --input <file> --checkpoint 3 --wait`, or use the trusted workflow control's approved start action for Vercel. The action returns on start; inspect the run until it reaches a terminal state or a wait.
8. At a checkpoint or approval, report saved rows, failures, ledger spend and cost sources, remaining projection, table, and exact inspection command. Ask the user to approve, deny, or comment. Continue the same run with `npm run gtm -- approve <token> --yes --wait`, or the trusted workflow control's approved decision action, only after their answer. The token names the pending stage; the bearer authorizes it.
9. If start returns `run_in_progress`, report the existing run key and do not retry. Inspect it. Use the cancel and reconcile recovery only when the operator chooses to abandon it.
10. To stop a live run, use `npm run gtm -- cancel <runKey> --wait` or the trusted approval-gated cancel action. Poll through `cancelling`; the duplicate guard stays closed until terminal `cancelled`. Saved rows and prior spend remain.
11. Report the honest terminal state: `completed`, `stopped`, `timed_out`, `failed`, or `cancelled`; include stop reason, remaining keys, failed step, rows written, cache hits, cost-source breakdown, and external changes.

For a missed scheduled day, write `scheduledInput` to an ignored file, dry-run it, then use `--scheduled-for <YYYY-MM-DD>` through the same run gate. A second start for that workflow and date returns `already_ran_today`.

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
4. A save containing `Runs: on Vercel` changes applies accepted migrations and commits once to `main`, which triggers the connected Vercel project. Name every migration and include full SQL for non-additive statements. Use trusted controls for read-only preview and status, and approval-gated start, approval, and cancel actions. Start waits for the exact committed HEAD. Keep the production run bearer and OIDC tokens in the host runtime; there is no deploy token.
5. Use no Studio and expose no port. Relay `gtm query --format markdown`, `gtm runs get`, `workflow inspect run`, and `workflow inspect hooks` output.
6. Start no real run in the sandbox. `Runs: on this computer` is a keyboard location; in the sandbox, recommend and deploy `Runs: on Vercel`. The sandbox database credential is read-only, so rows change only through hosted runs and accepted migrations.

## Recovery

<!-- TEMPORARY: waits on workflow@5.0.0: remove the recovery override after restart cannot re-enqueue a pending paid step. -->

| Failure | Required response |
| --- | --- |
| `.env.local` exists | Stop local server start or reuse. Name the file and explain that it would select the cloud database. |
| No injection-safe local model backend | For untrusted input, use a backend that enforces `tools: "none"`; accept `tools: "host-default"` only for trusted input after explicit operator review. |
| Sandbox CLI backend selected | Set `GTM_AGENT_BACKEND=api` and provide the Gateway credential through the host. |
| Sandbox file URL selected | Supply the workspace Turso URL and token through the host. |
| Duplicate live run | Inspect the returned run key. Do not retry. |
| Zombie `running`, `waiting`, or `cancelling` row | Keep `WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=0`; run `npx workflow cancel <runId>`, then `npm run gtm -- runs get <runKey>`. |
| Runaway or stuck hosted run | Run `npm run gtm -- cancel <runKey>` or the trusted cancel action, then inspect with `runs get` or the status action. |
| Hook no longer pending | Inspect the run. A denied, timed-out, cancelled, completed, or already-resolved hook cannot resume. |
| No Vercel model backend | Add a budgeted Gateway key, then deploy again. |
| Provider authentication or quota hold | Fix credentials or budget, inspect `remaining_keys`, then create a newly approved input containing only those keys. |
| Run state expired | The retained SDK state exceeded the plan window; use `workflow_runs`, the ledger, and result tables as the durable record. |
| Table missing at runtime | Do not retry the workflow. Compare its runtime SQL table name with the declaration and generated migration, repair any orphan migration with `db:generate`, run `db:migrate`, then verify both the table and the migration hash in `__drizzle_migrations`. Enter the run gate again only after those checks pass. |
| Local migration is busy | Stop the owned Nitro process and retry `db:migrate` once. |
| Graph or lib change not visible | Restart the owned Nitro process through `open.md`. |
| Persistence unavailable | Leave tracked bytes unchanged and offer keyboard recovery. |
