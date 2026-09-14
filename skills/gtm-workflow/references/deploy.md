# Deploy

Deploy is the push. The workflow Vercel project is connected to the workspace repository with root directory `workflows/`, so every push to `main` that changes `workflows/` builds and deploys it; Vercel skips the build when nothing under `workflows/` changed. The agent never runs the Vercel CLI, never holds a Vercel token, and never writes secrets anywhere. A workspace without a remote is told to share it first (gtm-workspace's sharing step).

## Connect the project, once

A connected project exists exactly when `GTM_WORKFLOW_URL` is present, in the process environment or in `workflows/.env`. When it is absent, Deploy gives the user these steps and names the four values to place on the host, then stops:

1. In Vercel, create a project from the workspace repository: root directory `workflows/`, production branch `main`, Node 22.
2. In its dashboard: connect a Turso database from the marketplace; set `GTM_RUN_SECRET` and `CRON_SECRET` (on a personal computer the user copies them from `workflows/.env`, which the agent never prints, or replaces both in both places; on a host without local runs, values the person chose and placed on the host), `GTM_MODEL` (`openai/gpt-5.6-luna` unless another Gateway model is wanted), and `AI_GATEWAY_API_KEY`, optionally `GTM_REASONING` (reasoning effort for AI steps and agent stages) and `EXA_API_KEY` (only for agent stages with web search on); turn Deployment Protection off for production; optionally `GTM_RUNS_URL` (the address of the project's Observability → Workflows page) and `GTM_DATA_URL` (the address of the database's Edit Data page in Turso), which become the hosted Runs and Data links; then Redeploy the latest deployment, because the first build ran before Turso existed and the template fails on purpose without it.
3. Place on the host `GTM_WORKFLOW_URL` (the production URL, `https://<host>`, no trailing slash), `GTM_RUN_SECRET`, `TURSO_STUDIO_URL` (the database URL with `libsql://` replaced by `https://`), and `TURSO_STUDIO_TOKEN` (a read-only token): `workflows/.env` on a personal computer, the host's own settings elsewhere.

## Readiness

When `GTM_WORKFLOW_URL` is present, Deploy checks readiness in code after the push: `git fetch`, then poll `GET /api/link/<slug>` on the deployed copy until `git merge-base --is-ancestor <newest commit touching workflows/> <commit>` holds for the `commit` it returns, bounded to a few minutes. Equality is not the test: a later commit outside `workflows/` can be the tip of the push, and Vercel skips its build. On timeout, report in plain words and name the Redeploy step. A host without local runs deploys before its first run.

## Rules

- Node 22 runtime; production Deployment Protection off, so signed diagram links open without a Vercel login.
- Schedules: `vercel.json` `crons` only; Vercel Cron calls `GET /api/run/<slug>` with `Authorization: Bearer <CRON_SECRET>`. `nitro.config.ts` mirrors the same list into the build output as a fallback. Hobby-plan crons run at most daily and the start time can drift within the hour.
- Where to look: `GET /api/link/<slug>` with the bearer returns the production diagram URL signed for 7 days, the Runs and Data page addresses when set, and `keys`, the names of the `*_API_KEY` variables on the workflow project; a host without local runs shares these three after a save that creates or changes a workflow, not after a run, never a localhost link.
- An agent stage with `backend: "claude"` or `"codex"` fails at start on the hosted copy by design; before pushing such a workflow the agent says so and offers the switch to `"gateway"` through Update.
- Reaching people from a run: set `GTM_AGENT_URL` (the GTM agent's production URL) and `GTM_NOTIFY_SECRET` (a long random string, the same value on the agent project, which also needs `GTM_NOTIFY_CHANNEL`) on the workflow project; the link route then lists nothing for them, since they are not keys, so the agent checks `notify` readiness by reading the run's first notification outcome.
- Inbound webhooks: the sender's signing secret goes on the workflow project under the variable the intake names; the sender's endpoint is `https://<host>/api/intake/<slug>`.
- Local `data/gtm.db` and Turso are separate: a local run after a hosted one may re-spend on rows the hosted copy already did; the agent says so when that happens.
- The deployed copy keeps its inlined criteria until the next Update is pushed.

Unverified items and their fallbacks are listed under "Unverified until first deploy" in [local.md](local.md).
