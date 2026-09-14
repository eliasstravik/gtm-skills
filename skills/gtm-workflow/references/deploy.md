# Deploy

Deploy is the push. The workflow Vercel project is connected to the workspace repository with root directory `workflows/`, so every push to `main` that changes `workflows/` builds and deploys it; Vercel skips the build when nothing under `workflows/` changed. The agent never runs the Vercel CLI, never holds a Vercel token, and never writes secrets anywhere. A workspace without a remote is told to share it first (gtm-workspace's sharing step).

## Connect the project, once

A connected project exists exactly when `GTM_WORKFLOW_URL` is present, in the process environment or in `workflows/.env`. When it is absent, Deploy names the way to connect it and stops. The recommended way is the `gtm-agent` skill on a computer where the GitHub and Vercel CLIs are signed in: "connect the workflow project for <org>" creates the project, the database, and every variable below, and places `GTM_WORKFLOW_URL` and `GTM_RUN_SECRET` where the agent reads them. By hand, the same result is:

1. In Vercel, create a project from the workspace repository: root directory `workflows/`, production branch `main`, Node 22.
2. In its dashboard: connect a Turso database from the marketplace; set `GTM_RUN_SECRET` and `CRON_SECRET` (on a personal computer the user copies them from `workflows/.env`, which the agent never prints, or replaces both in both places; on a host without local runs, values the person chose and placed on the host), `GTM_MODEL` (`openai/gpt-5.6-luna` unless another Gateway model is wanted), optionally `GTM_REASONING` (reasoning effort for AI steps and agent stages); never `GTM_AGENT_BACKEND`, which is a personal-computer setting, and never an AI Gateway key, since the deployed copy calls the Gateway with the project's own identity; turn Deployment Protection off for production; `GTM_RUNS_URL` (the address of the project's Observability → Workflows page, `https://vercel.com/<team>/<project>/observability/workflows`), which becomes the hosted Runs link; a workflow with a `data` registry property uses its signed [linked data viewer](linked-data.md); otherwise the Data link is the database's Edit Data page in Turso, read off `TURSO_DATABASE_URL` for a marketplace database, and `GTM_DATA_URL` overrides it; then Redeploy the latest deployment, because the first build ran before Turso existed and the template fails on purpose without it.
3. Place on the host `GTM_WORKFLOW_URL` (the production URL, `https://<host>`, no trailing slash) and `GTM_RUN_SECRET`: `workflows/.env` on a personal computer, the host's own settings elsewhere. Hosted data is read through the deployed copy's query route with that same secret; no database token leaves the project.

## Readiness

When `GTM_WORKFLOW_URL` is present, Deploy checks readiness in code after the push: `git fetch`, then poll `GET /api/link/<slug>` on the deployed copy until `git merge-base --is-ancestor <newest commit touching workflows/> <commit>` holds for the `commit` it returns, bounded to a few minutes. Equality is not the test: a later commit outside `workflows/` can be the tip of the push, and Vercel skips its build. On timeout, report in plain words and name the Redeploy step. A host without local runs deploys before its first run.

## Rules

- Node 22 runtime; production Deployment Protection off, so signed diagram links open without a Vercel login.
- Model access: the deployed copy calls AI Gateway with the Vercel project's OIDC identity (`oidcTokenConfig` on by default); `AI_GATEWAY_API_KEY` is a personal-computer setting for a checkout that is not linked to a Vercel project, never a project variable.
- Hosted data: `POST /api/query` with the bearer and `{ sql, args? }` runs one read-only statement against the result tables and returns `{ columns, rows, truncated }` (1,000 rows at most); it is how a host without local runs reads rows, and how a personal computer reads the hosted copy's data.
- Schedules: `vercel.json` `crons` only; Vercel Cron calls `GET /api/run/<slug>` with `Authorization: Bearer <CRON_SECRET>`. `nitro.config.ts` mirrors the same list into the build output as a fallback. Hobby-plan crons run at most daily and the start time can drift within the hour.
- Where to look: `GET /api/link/<slug>` with the bearer returns the production diagram URL signed for 7 days, the Runs and Data page addresses when set, and `keys`, the names of the `*_API_KEY` variables on the workflow project; a host without local runs shares these three after a save that creates or changes a workflow, not after a run, never a localhost link.
- Agent stages on the hosted copy always run through the Gateway: `GTM_AGENT_BACKEND` is read from `.env` on a personal computer only, and a stage that names a CLI backend in code takes the Gateway on Vercel. No workflow needs an edit to move between the two.
- A push never touches a run already in flight: it finishes on the deployment it started with, and a cancelled parent cancels its child runs. Upgrade lets running runs finish or cancels them first; it does not wait for them.
- Reaching people from a run: set `GTM_AGENT_URL` (the GTM agent's production URL) and `GTM_NOTIFY_SECRET` (a long random string, the same value on the agent project, which also needs `GTM_NOTIFY_CHANNEL`) on the workflow project; the link route then lists nothing for them, since they are not keys, so the agent checks `notify` readiness by reading the run's first notification outcome.
- Inbound webhooks: the sender's signing secret goes on the workflow project under the variable the intake names; the sender's endpoint is `https://<host>/api/intake/<slug>`.
- Local `data/gtm.db` and Turso are separate: a local run after a hosted one may re-spend on rows the hosted copy already did; the agent says so when that happens.
- The deployed copy keeps its inlined criteria until the next Update is pushed.

Unverified items and their fallbacks are listed under "Unverified until first deploy" in [local.md](local.md).
