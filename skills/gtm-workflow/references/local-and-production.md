# Local and production

A workspace is an ordinary Vercel app: `workflows/` on a laptop is local, the Vercel project `gtm-<ws>` is production. Code and schema go up only through `git push`. Local never writes production through app features.

| | Local | Production |
| --- | --- | --- |
| Start | `npm run dev` in `workflows/` | `git push` to `main` (the build migrates Neon) |
| Keys | `workflows/.env.local`, Keys page at `/connections` | Production env vars, the deployed Keys page |
| Database | this workspace's own Postgres (`data/pg`) | Neon, through the Vercel integration |
| Who gets in | this computer, or the owner's tailnet login | Vercel Authentication on every deployment |
| Previews | none | none: `main` only (`vercel.json` `git.deploymentEnabled`, project setting off) |

## From a laptop, with Vercel's own tools

Link once: `vercel link` in `workflows/` (shared setup `--deploy` does it; it first refuses a Development environment that holds the production database and adds keys saved only in `.env.local` to Development). Then, from `workflows/`:

- Start a production run: `vercel curl /api/run/<slug> -- -X POST` (add `-H 'content-type: application/json' -d '{"maxRows":1}'` for a limited run).
- Read production rows: `vercel curl /api/query -- -X POST -H 'content-type: application/json' -d '{"sql":"select key, score from example_scores limit 20"}'`.
- A run's state: `vercel curl /api/runs/<id>`; runs: `npx workflow inspect runs --backend vercel`; logs: `vercel logs`.
- Keys: `vercel env add <NAME> production` (or the deployed Keys page, or the dashboard); `vercel env pull` fills `.env.local` from Development as usual.
- The database: the Neon console, from the project's Storage tab.

`vercel curl` is in beta; if it breaks, plain `curl` with `-H "x-vercel-protection-bypass: <secret>"` (Project Settings > Deployment Protection > Protection Bypass for Automation) does the same.

## Who can do what in production

- Anyone who passes Vercel Authentication (every member of the Vercel team, Viewer role included) can start runs and read rows through the routes above. Accepted.
- Share links and the key-name list (`/api/viewer/service`, `/api/connections`) also need Vercel's automation bypass secret, which the GTM agent's host adds and `vercel curl` sends. Anyone who can read the project's settings can read that secret.
- Vercel Cron calls `GET /api/run/<slug>` with `CRON_SECRET`; GET starts nothing without it, and nothing at all locally.
- The share project's relay identity reaches only intake and the shared viewer; every other route refuses it.
- The Keys page and sharing in the browser need a signed-in owner session, as before.
