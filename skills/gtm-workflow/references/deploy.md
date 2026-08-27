# Deploy GTM workflows to Vercel

Use this flow only after accepted workflow bytes say `Runs: on Vercel`. Run commands inside the workspace `workflows/` directory.

## Deployment gate

If deployment is not already authorized, ask:

```text
**Would you like to put this workflow live on Vercel now?**

1. Deploy and verify it (Recommended)
2. Keep it saved but not live
3. Cancel

Reply with a number, or type your answer.
```

Option 2 closes with the saved and live state. Option 3 cancels deployment only.

## Choose the deployment control

When a trusted workflow deployment control is available, use it. Its preview action validates the exact committed workspace HEAD, tracked `workflows/` source, package deployment metadata, workflow checks, production environment names, and committed migration files without deploying. Show that preview before the deployment gate. After acceptance, call its approved deploy action with the same HEAD. The host applies committed migrations, uploads only tracked files beneath `workflows/`, targets its fixed production project, waits for `READY` or `ERROR`, and returns sanitized deployment evidence.

The trusted control owns its Vercel access token. Keep `api.vercel.com`, the token, and the production run bearer outside the sandbox. Do not add a Git connection to the workflow project and do not treat a workspace commit as a deployment.

Use the CLI path below only when no trusted deployment control exists.

## CLI check

On a laptop, require `vercel` on `PATH` and a successful `vercel whoami`. If either fails, ask the user to install the CLI and run `vercel login`, then wait and recheck.

When `GTM_SANDBOX=1` and no trusted deployment control exists, stop and name deployment as a keyboard follow-up. Do not put a deploy credential or Vercel CLI into the sandbox.

## Model key check

Before linking on the CLI path, scan workflows for `agent()` calls. If any exists and ignored `.env` has no non-empty `AI_GATEWAY_API_KEY`, ask the user to save a budgeted Gateway key directly into `workflows/.env` without sharing it in conversation. Stop deployment until the non-empty variable exists. The trusted control instead verifies that the fixed production project declares the required environment names and never reads their values.

## Link, database, and environment

1. Refuse deployment if `.env.local` already exists. Name it and leave it unchanged.
2. Run `vercel link --yes --project <org-slug>-workflows`.
3. Check `vercel env ls production` for `TURSO_DATABASE_URL`.
4. When it is absent, run:

```text
vercel install tursocloud --environment production --format=json
```

This Vercel Marketplace slug and flag set is current as of the v4 build. If the CLI requires marketplace terms or plan selection, stop for that user decision. The integration supplies `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.

5. Record whether `.env.local` existed before install. Since step 1 refused a preexisting file, delete `.env.local` if install created it and say so. The production database pair belongs in `.env.turso`, not `.env`.
6. Run `vercel env pull .env.turso --environment production`. Require both Turso variables. If the auth token is not pullable, ask the user to create a database token in the Turso dashboard and write the pair directly to ignored `.env.turso`.
7. Run `npm run db:migrate:cloud`. Migrations do not run during build.
8. Read names from `.env.example`. For each name with a non-empty `.env` value absent from production, transfer its value through shell input to `vercel env add <name> production`. Disable shell tracing and print no value. Leave the empty Turso pair in `.env.example` unsynced.
9. Sync `GTM_AGENT_BACKEND` only when it is `api`. Set `CRON_SECRET` to the same value as `GTM_RUN_SECRET` through shell input.

## Deploy and record

1. Run `vercel deploy --prod --yes` on the CLI path, or the approved deploy action on the trusted-control path.
2. Stop on a failed build or deployment.
3. Record the linked team, project, and production URL under `package.json` `gtm.vercel`.
4. Inspect and save that non-secret metadata change.

Deploy from the CLI or the trusted host control only. Configure no Git-connected deployment and no separate root directory.

## Verify

1. Run `npm run gtm -- check` before deployment and keep its output.
2. Run the accepted production input through `gtm run --dry-run`.
3. Start the first real run with `--checkpoint 3 --wait` against the recorded production URL, or use the trusted workflow control's approved start action and poll by run key.
4. Query the first rows with `npm run gtm -- query --cloud` and inspect them through `npm run db:studio:cloud`.
5. Ask for checkpoint approval. Resume the same run with `gtm approve --yes --wait`, or use the trusted control's approved decision action. Never expose its internally resolved hook token.
6. Require a terminal `workflow_runs` row, expected business rows, and a visible run in Vercel Observability.
7. For a scheduled workflow, invoke its GET route once with `CRON_SECRET` and save the response. A second live GET must return 409.
8. For a webhook workflow, require `runs get` to show its per-run URL, POST one fixture payload to it, and require completion.

## Evidence

Save sanitized path 2 and path 5 evidence under `evals/gtm-workflow/evidence/`. Include command names, status codes, timestamps, run keys, row counts, cache-hit counts, migration result, and relevant redacted output. Do not save credentials or full environment files.

Before commit, scan evidence and `.env.turso` for the run bearer, Turso token, and Gateway key. Keep `.env.turso` ignored. Put the harness output and evidence file list in the pull request body.

## Live state

`Live` means production deployment succeeded, cloud migration applied, a run started through the recorded URL, and verification reached the expected database and workflow state. A saved workflow that has not passed this flow is not live.

On Vercel Hobby, cron may fire once daily within its hour and may double-fire. The live-run guard covers overlap. Delivery payloads include the SDK run id and UTC date for receiver deduplication.
