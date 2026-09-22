# Deploy

Connections uses an existing protected workflow project. Run the trusted skill's `scripts/setup.mjs --workspace <path> --deploy --team <team> --workflow-project <existing-project>`. It configures project-scoped access and creates no additional projects or databases. See [Connections setup](connections.md) for the token setup and browser verification.

Enter provider keys directly in the private Workflows UI's Connections tab. Local keys are never uploaded automatically. Production changes save Vercel Secrets and take effect after a deliberate workflow deployment.

Ordinary authored workflow deployment is a push to the workspace repository's production branch. The project builds from `workflows/`; Connections deploys with that runtime. Preserve the existing isolated share project and its access restrictions.

## Database

The deployed copy's database is Neon Postgres, one per workspace, in the Vercel team that owns the workspace. It is always added through the Neon integration in Vercel, never with hand-set connection strings: connect it to the workflow project only, Production environment only, preview branching off, maximum compute 0.25 CU. The one manual step is accepting the Neon marketplace terms the first time a team uses it. The integration sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (used by migrations and the query route); never set, copy or print them. The share project holds no database variable of any kind.

The production build migrates: `npm run build` runs `scripts/migrate.mjs`, which targets the project's database only when `VERCEL_ENV=production`. A preview build and a local build skip migrations, whatever URLs are in the environment. Migrations only add, because a build that fails after migrating leaves the old code running on the new schema. See [Cost on Neon](local.md#cost-on-neon).

## Verify deployment

When `GTM_WORKFLOW_URL` is present, Deploy checks readiness in code after the push: `git fetch`, then poll `GET /api/link/<slug>` on the deployed copy until `git merge-base --is-ancestor <newest commit touching workflows/> <commit>` holds for the `commit` it returns, bounded to a few minutes. Equality is not the test: a later commit outside `workflows/` can be the tip of the push, and Vercel skips its build. On timeout, report in plain words and name the Redeploy step. A host without local runs deploys before its first run.

## Rules

- Node 22 runtime; Vercel Authentication on All Deployments protects the private runtime and viewer. Never disable it to repair an agent call.
- Model access: the deployed copy calls AI Gateway with the Vercel project's OIDC identity (`oidcTokenConfig` on by default); `AI_GATEWAY_API_KEY` is a personal-computer setting for a checkout that is not linked to a Vercel project, never a project variable.
- Hosted data: `POST /api/query` with the bearer and `{ sql, args? }` runs one read-only Postgres statement (parameters `$1`, `$2`, …; 5 seconds; at most 1,000 rows and 2 MB leave the database, behind a cursor, whatever the statement says) and returns `{ columns, rows, truncated }`; it is how a host without local runs reads rows, and how a personal computer reads the hosted copy's data. Every byte it returns is Neon data transfer, so name columns and add `LIMIT`. What to write is under [Data](local.md#data).
- Schedules: `vercel.json` `crons` only; Vercel Cron calls `GET /api/run/<slug>` with `Authorization: Bearer <CRON_SECRET>`. `nitro.config.ts` mirrors the same list into the build output as a fallback. Hobby-plan crons run at most daily and the start time can drift within the hour.
- Where to look: `GET /api/link/<slug>` with the bearer returns the canonical private `viewerUrl`, and `keys`, the names of the `*_API_KEY` variables on the workflow project; a host without local runs returns Open GTM Workflows after a save that creates or changes a workflow, not after a run, never a localhost link.
- Agent stages on the hosted copy always run through the Gateway: `GTM_AGENT_BACKEND` is read from `.env` on a personal computer only, and a stage that names a CLI backend in code takes the Gateway on Vercel. No workflow needs an edit to move between the two.
- A push never touches a run already in flight: it finishes on the deployment it started with, and a cancelled parent cancels its child runs. Upgrade lets running runs finish or cancels them first; it does not wait for them.
- Reaching people from a run: set `GTM_AGENT_URL` (the GTM agent's production URL) and `GTM_NOTIFY_SECRET` (a long random string, the same value on the agent project, which also needs `GTM_NOTIFY_CHANNEL`) on the workflow project; the link route then lists nothing for them, since they are not keys, so the agent checks `notify` readiness by reading the run's first notification outcome.
- Inbound webhooks: the sender's signing secret goes on the workflow project under the variable the intake names; the sender's endpoint is `https://<host>/api/intake/<slug>`.
- The local database and the hosted one are separate: a local run after a hosted one may re-spend on rows the hosted copy already did; the agent says so when that happens.
- The deployed copy keeps its inlined criteria until the next Update is pushed.

Unverified items and their fallbacks are listed under "Unverified until first deploy" in [local.md](local.md).

## Protected viewer rollout

Follow [viewer.md](viewer.md) for machine access, the share-only companion, immutable workflow identities and grant policy. Configure and deploy the upgraded agent before activating the native gate. Verify harmless Queue/resumption, cron and any signed intake under protection. Deploy the share-only project with `npm run build:share`, production-to-production trust, and only its private origin/project settings. Verify its fixed read proxy before setting `GTM_VIEWER_SHARE_ORIGIN` on the private runtime and redeploying to expose Share.
