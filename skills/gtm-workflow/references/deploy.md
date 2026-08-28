# Deploy GTM workflows to Vercel

Use this flow for accepted workflow bytes that say `Runs: on Vercel`. The workflow project is the connected workspace repository with Vercel Root Directory `workflows`, production branch `main`, and builds skipped when that directory is unchanged.

## One save-and-deploy gate

There is no separate deployment action. The save proposal must say plainly that accepting the workflow commit writes to `main` and therefore starts a production Vercel deployment. It must include validation, dry-run scope, migrations, affected files, and the resulting live state.

Offer a saved-but-not-deployed option only by keeping the draft outside the repository. Do not commit a Vercel workflow draft to another branch or add a second deployment repository.

## Before the commit

1. Run `npm run gtm -- check` and the accepted production input through `gtm run --dry-run`.
2. Generate committed migrations only after acceptance. Inspect the SQL and require its journal entry plus numbered snapshot when schema DDL needs one. Show the full SQL for anything beyond additive `CREATE TABLE` or `ADD COLUMN`; declare `DELETE`, `UPDATE`, `RENAME`, `DROP`, and `CREATE TRIGGER` destructive. Use expand/contract instead of an in-place rename.
3. Apply new committed migrations to the workspace Turso database inside the approval-gated save operation, then verify every accepted SQL SHA-256 hash exists in `__drizzle_migrations` before creating the Git commit. A successful command without the ledger entries is a failed save. Migrations must be backward-compatible because an applied migration can outlive a failed commit or deployment. Nothing runs migration as a build side effect.
4. Require the connected workflow project to expose Vercel system environment variables so `VERCEL_GIT_COMMIT_SHA` is available at runtime.

In a sandbox, submit the accepted tracked batch through `apply_gtm_workspace_changes`. The request names every migration file it carries, includes the generated journal plus any schema snapshot, and declares whether any statement drops a table or column. The tool stages the accepted workflow tree, applies its new migrations through a write credential that exists only for that step, verifies their hashes in the ledger, then atomically commits to `main`. It never receives a Vercel token and never opens `api.vercel.com`.

On a laptop, place these three non-empty values in ignored `.env.turso`: `TURSO_DATABASE_URL`, the write-only `TURSO_AUTH_TOKEN` used by `db:migrate:cloud`, and `TURSO_READ_ONLY_AUTH_TOKEN` used by `gtm query --cloud` and `db:studio:cloud`. Neither inspection command may fall back to the write token. Run the cloud migration; its credential preflight, exit status, and ledger verification must all pass before committing and pushing the accepted batch to `main`.

## Git-connected project setup

Initial setup is a keyboard operation, not a Slack workflow action:

1. Create or select one Vercel project for the workspace workflows.
2. Connect it to the same workspace repository.
3. Set Root Directory to `workflows` and Production Branch to `main`.
4. Configure the project to skip a build when `workflows/` is unchanged.
5. Configure Eve's commit-author name and verified Git email to map to the Vercel project owner on Hobby, or a project team member on Pro. The GitHub App remains the committer.
6. Install Turso or add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for production.
7. Add `GTM_RUN_SECRET`, set `CRON_SECRET` to the same value for schedules, and add any Gateway or provider variables named by `.env.example`.
8. Enable Vercel system environment variables and record the non-secret team, project, and production URL under `package.json` `gtm.vercel`.
9. Add a Trusted Sources rule permitting the Eve production project to call this protected workflow production project with OIDC.

Do not configure a Vercel deploy token in Eve. Do not give the sandbox Vercel CLI access. `api.vercel.com` stays closed.

## Wait for the exact commit

After the save tool returns the new commit SHA, production is deploying, not yet live. A trusted workflow start control must:

1. repeat the zero-spend dry run against that exact committed checkout;
2. poll the bearer-protected `GET /api/deployment` route with Eve's short-lived OIDC identity until it returns that exact SHA;
3. time out without starting when the SHA never becomes live; and
4. send the same SHA in `x-gtm-workspace-head` on `POST /api/run/<workflow>` so the runtime rechecks it atomically; production refuses a missing header as well as a mismatch.

The run route returns `409 deployment_not_ready` if production changed between the poll and the start. Never fall back to an older deployment or silently run a different commit.

## Verify

1. Start the first real run with a checkpoint after three rows through the trusted start action, or use the CLI against the production URL after its exact commit is live.
2. Query the first rows and inspect the run.
3. Ask for checkpoint approval and resume the same run. The trusted control resolves the hook token internally and never returns it.
4. Stop a live run with the trusted cancel action or `npm run gtm -- cancel <runKey> --wait 30`; it is approval-gated, polls through `cancelling`, and reports terminal `cancelled`.
5. Require a terminal `workflow_runs` row, expected business rows, and a visible run in Vercel Observability.
6. For a scheduled workflow, invoke its GET route once with `CRON_SECRET`; a second GET for the same UTC date must return `already_ran_today`, even after completion. Verify a missed-date catch-up with reviewed input and `--scheduled-for`.
7. For a triggered workflow, require `runs get` to show a pending trigger, POST one fixture payload to the bearer-protected trigger route, and require completion. Use a public webhook only when the caller cannot send the bearer, and validate its payload.

## Live state

`Deploying` means the accepted `main` commit exists but the production deployment endpoint does not yet report that SHA. `Live` means the exact SHA is in production, its migration has applied, and verification reached the expected database and workflow state. A draft outside Git is neither saved nor live.

The platform documentation sets the lowest-plan function cap at 300 seconds; `agent()` defaults below it at 240 seconds. Retained execution is temporary, while `workflow_runs`, the paid ledger, and business tables are the durable record; see the contract for plan retention, request-body, event, step, and child-workflow batching limits.

Cron may double-fire or miss. The `scheduled_for` unique key covers same-day overlap and completed duplicates; delivery payloads use that UTC date, not the SDK run id, for receiver deduplication.
