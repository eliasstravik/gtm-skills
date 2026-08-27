# Deploy GTM workflows to Vercel

Use this flow for accepted workflow bytes that say `Runs: on Vercel`. The workflow project is the connected workspace repository with Vercel Root Directory `workflows`, production branch `main`, and builds skipped when that directory is unchanged.

## One save-and-deploy gate

There is no separate deployment action. The save proposal must say plainly that accepting the workflow commit writes to `main` and therefore starts a production Vercel deployment. It must include validation, dry-run scope, migrations, affected files, and the resulting live state.

Offer a saved-but-not-deployed option only by keeping the draft outside the repository. Do not commit a Vercel workflow draft to another branch or add a second deployment repository.

## Before the commit

1. Run `npm run gtm -- check` and the accepted production input through `gtm run --dry-run`.
2. Generate committed migrations only after acceptance. Inspect the SQL and require its matching `drizzle/meta/_journal.json` entry and numbered snapshot in the same tracked batch.
3. Apply new committed migrations to the workspace Turso database inside the approval-gated save operation, then verify every accepted SQL SHA-256 hash exists in `__drizzle_migrations` before creating the Git commit. A successful command without the ledger entries is a failed save. Migrations must be backward-compatible because an applied migration can outlive a failed commit or deployment. Nothing runs migration as a build side effect.
4. Require the connected workflow project to expose Vercel system environment variables so `VERCEL_GIT_COMMIT_SHA` is available at runtime.

In a sandbox, submit the accepted tracked batch through `apply_gtm_workspace_changes`. The request names every migration file it carries, includes each generated journal and snapshot artifact, and declares whether any statement drops a table or column. The tool stages the accepted workflow tree, applies its new migrations through a write credential that exists only for that step, verifies their hashes in the ledger, then atomically commits to `main`. It never receives a Vercel token and never opens `api.vercel.com`.

On a laptop, pull the production Turso pair into ignored `.env.turso`, run `npm run db:migrate:cloud`, and then commit and push the accepted batch to `main`.

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
4. send the same SHA in `x-gtm-workspace-head` on `POST /api/run/<workflow>` so the runtime rechecks it atomically.

The run route returns `409 deployment_not_ready` if production changed between the poll and the start. Never fall back to an older deployment or silently run a different commit.

## Verify

1. Start the first real run with a checkpoint after three rows through the trusted start action, or use the CLI against the production URL after its exact commit is live.
2. Query the first rows and inspect the run.
3. Ask for checkpoint approval and resume the same run. The trusted control resolves the hook token internally and never returns it.
4. Stop a live run with the trusted cancel action or `npm run gtm -- cancel <runKey>`; it is approval-gated and reports the run as `cancelled`.
5. Require a terminal `workflow_runs` row, expected business rows, and a visible run in Vercel Observability.
6. For a scheduled workflow, invoke its GET route once with `CRON_SECRET`; a second matching live GET must return 409.
7. For a webhook workflow, require `runs get` to show its per-run URL, POST one fixture payload, and require completion.

## Live state

`Deploying` means the accepted `main` commit exists but the production deployment endpoint does not yet report that SHA. `Live` means the exact SHA is in production, its migration has applied, and verification reached the expected database and workflow state. A draft outside Git is neither saved nor live.

On Vercel Hobby, cron may fire once daily within its hour and may double-fire. The live-run guard covers overlap. Delivery payloads include the SDK run id and UTC date for receiver deduplication.
