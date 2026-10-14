# Local and production

A workspace is an ordinary Vercel app: `workflows/` on a laptop is local, the Vercel project `gtm-<ws>` is production. Code and schema go up only through `git push`. Local workflow runs and result data never write production. Workflow groups are code (`workflows/groups.ts`) and travel with it.

| | Local | Production |
| --- | --- | --- |
| Start | `npm run dev` in `workflows/` | `git push` to `main` (the build migrates Neon) |
| Keys | `workflows/.env.local`, Keys page at `/connections` | Production env vars, the deployed Keys page |
| Database | this workspace's own Postgres (`data/pg`) | Neon, through the Vercel integration |
| Who gets in | this computer, or the owner's tailnet login | Vercel Authentication on every deployment |
| Previews | none | none: `main` only (`vercel.json` `git.deploymentEnabled`, project setting off) |
| Schedules | never fire; run by hand with `curl -X POST http://127.0.0.1:3939/api/run/<slug>` | Vercel Cron from `vercel.json` |
| Data | separate; `npm run db:pull` copies production down on request | written only by production runs; a CSV import is one ([imports](imports.md)) |

## Viewer organization and runs

Both environments use the same private viewer implementation: root Workflows, Runs, Data and Connections navigation, plus the existing per-workflow Diagram, Runs, Data and Connections tabs. Root Runs lists cross-workflow run metadata with the associated workflow; workflow, status, time and search filters narrow it. Per-workflow Runs remains scoped to the selected workflow. Opening or filtering the viewer starts nothing.

Groups come from `workflows/groups.ts` ([viewer](viewer.md#workflow-groups)), so local shows the working copy's groups and production shows `main`'s, exactly like the workflows: a regrouping not yet pushed shows locally only. There is no group store, no production sync and no unavailable state. A group page's Runs and Data read the environment they run in, like every other view.

### From folders to groups

Releases up to 0.2.6 kept nested folders in the runtime tables `gtm.workflow_folder_scopes`, `gtm.workflow_folders` and `gtm.workflow_folder_assignments`; a linked workspace kept its only copy in production's database and the local viewer reached it with the owner's Vercel login, recording `data/workflow-folder-mode.json`. 0.2.7 reads them once, during Upgrade, from `workflows/`:

1. `node scripts/folders-to-groups.mjs` reads production's folders when `.vercel/project.json` links the workspace (a read-only session through the owner's `neonctl` login, as `db:pull` uses), else this computer's (`--source production|local|<saved state.json>` overrides). It prints the proposed `groups.ts`: each folder that holds workflows becomes one group named by its path ("Outbound · EMEA") in tree order, its workflows by title; empty folders are dropped and listed; a placement of a workflow this workspace no longer has is listed, never carried over. Workflow IDs, runs, data and share links are untouched.
2. No folder holds a workflow (the common case): run it again with `--suggest`, which clusters workflows that start one another as stages, share a data definition or write the same workflow table, and propose names, plus any single-workflow groups worth having, from what each workflow does.
3. Show the proposal, save it with `--write` (refused when `groups.ts` already has groups) or by editing the file, build, and commit with the upgrade. Then delete `data/workflow-folder-mode.json`; Doctor reports it until then.

The three tables are left as they are, unused, for one release, so going back to 0.2.6 loses nothing. The release after drops them with a runtime migration; nothing reads them meanwhile.

Upgrade the runtime and apply its runtime migrations in each target environment, preserving workflow IDs, authored workflows, application tables, saved runs, credentials and existing grants. Verify root Runs, a group's Runs and Data, and per-workflow Runs without starting a run. Record source revisions and distinguish implemented, installed, deployed and behaviorally verified; a deployment alone does not prove a feature works.

## From a laptop, with Vercel's own tools

Link once: `vercel link` in `workflows/` (shared setup `--deploy` does it, after refusing a Development environment that holds the production database). Then, from `workflows/`:

- Start a production run: `vercel curl /api/run/<slug> -- -X POST` (add `-H 'content-type: application/json' -d '{"maxRows":1}'` for a limited run). A workflow that already has a run pending or running answers 409 `{"error":"already_running","runningRunId":…}`, whoever started it (a schedule, a teammate, the Slack agent); wait for it or cancel it. Only one network enrichment runs per workspace at a time; a second one fails saying so.
- Read production rows: `vercel curl /api/query -- -X POST -H 'content-type: application/json' -d '{"sql":"select key, score from example_scores limit 20"}'`.
- A run's state: `vercel curl /api/runs/<id>`; runs: `npx workflow inspect runs --backend vercel`; logs: `vercel logs`.
- Keys: `vercel env add <NAME> production` (or the deployed Keys page, or the dashboard); `vercel env pull` fills `.env.local` from Development as usual.
- The database: the Neon console, from the project's Storage tab. Copy it down with `npm run db:pull`; a power user's Neon development branch goes in `DATABASE_URL` locally (see [local database](local.md#local-database)).

`vercel curl` is in beta; if it breaks, plain `curl` with `-H "x-vercel-protection-bypass: <secret>"` (Project Settings > Deployment Protection > Protection Bypass for Automation) does the same.

## Starting points

- **Local only:** shared setup `--local`, then `npm run dev`. No accounts.
- **Going live** (now, or any time later): shared setup `--deploy` ([Deploy](deploy.md)). It is the same command whether the workspace was local first, already on GitHub, or made by gtm-agent setup; run again, it only repairs what is missing.
- **Slack agent first:** gtm-agent setup ends by running shared setup `--deploy --agent-project …`. Connecting an agent to a live workspace later is the same command with `--agent-project`.
- **A teammate or a second computer joins** with no setup command, like any Vercel app:

  ```sh
  git clone https://github.com/<owner>/gtm-<ws> && cd gtm-<ws>/workflows
  npm ci
  vercel link --yes --project gtm-<ws> --scope <team>
  vercel env pull
  npm run dev
  ```

  Their local database starts empty (`npm run db:pull` copies production down, after `setup --deploy` once on that computer for the Neon project). Settings that are not keys (`GTM_AGENT_BACKEND`, tailnet mode) live in each computer's own `workflows/.env`.
- **Removing production:** see [Deploy](deploy.md#removing-production).

## Who can do what in production

- Anyone who passes Vercel Authentication (every member of the Vercel team, Viewer role included) can start runs and read rows through the routes above. Accepted.
- Share links and the key-name list (`/api/viewer/service`, `/api/connections`) also need Vercel's automation bypass secret, which the GTM agent's host adds and `vercel curl` sends. Anyone who can read the project's settings can read that secret.
- Vercel Cron calls `GET /api/run/<slug>` with `CRON_SECRET`; GET starts nothing without it, and nothing at all locally.
- The share project's relay identity reaches only intake and the shared viewer; every other route refuses it.
- The Keys page and sharing in the browser need a signed-in owner session, as before.
