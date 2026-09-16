# Deploy

For first-time hosting, use the trusted installed skill's `scripts/setup.mjs --workspace <path> --deploy --team <team> [--github-owner <owner>]`. This shared setup works without GTM Agent or Slack. It creates the repository when needed, private workflow project, separate Connections project and database, protected machine access, and share companion. It preserves existing credentials and authored files. See [Connections setup](connections.md) for registration, consent, resume, and verification.

The local owner process uses signed-in GitHub and Vercel CLIs. The hosted workflow/agent receives no owner token or Connections administration credentials. Unsupported identity and integration registration steps use the documented owner dashboard flow; remaining provisioning stays in the CLI. Enter provider keys directly in the protected Production Connections form. Local keys are never uploaded automatically.

After setup, ordinary authored workflow deployment is a push to the workspace repository's production branch. The project builds from `workflows/`. Deploying Connections itself requires an explicit trusted component upgrade; editing a workspace cannot change its manager. Connection CRUD only saves settings. Apply them with a deliberate workflow deployment.

## Verify deployment

When `GTM_WORKFLOW_URL` is present, Deploy checks readiness in code after the push: `git fetch`, then poll `GET /api/link/<slug>` on the deployed copy until `git merge-base --is-ancestor <newest commit touching workflows/> <commit>` holds for the `commit` it returns, bounded to a few minutes. Equality is not the test: a later commit outside `workflows/` can be the tip of the push, and Vercel skips its build. On timeout, report in plain words and name the Redeploy step. A host without local runs deploys before its first run.

## Rules

- Node 22 runtime; Vercel Authentication on All Deployments protects the private runtime and viewer. Never disable it to repair an agent call.
- Model access: the deployed copy calls AI Gateway with the Vercel project's OIDC identity (`oidcTokenConfig` on by default); `AI_GATEWAY_API_KEY` is a personal-computer setting for a checkout that is not linked to a Vercel project, never a project variable.
- Hosted data: `POST /api/query` with the bearer and `{ sql, args? }` runs one read-only statement against the result tables and returns `{ columns, rows, truncated }` (1,000 rows at most); it is how a host without local runs reads rows, and how a personal computer reads the hosted copy's data.
- Schedules: `vercel.json` `crons` only; Vercel Cron calls `GET /api/run/<slug>` with `Authorization: Bearer <CRON_SECRET>`. `nitro.config.ts` mirrors the same list into the build output as a fallback. Hobby-plan crons run at most daily and the start time can drift within the hour.
- Where to look: `GET /api/link/<slug>` with the bearer returns the canonical private `viewerUrl`, and `keys`, the names of the `*_API_KEY` variables on the workflow project; a host without local runs returns Open GTM Workflows after a save that creates or changes a workflow, not after a run, never a localhost link.
- Agent stages on the hosted copy always run through the Gateway: `GTM_AGENT_BACKEND` is read from `.env` on a personal computer only, and a stage that names a CLI backend in code takes the Gateway on Vercel. No workflow needs an edit to move between the two.
- A push never touches a run already in flight: it finishes on the deployment it started with, and a cancelled parent cancels its child runs. Upgrade lets running runs finish or cancels them first; it does not wait for them.
- Reaching people from a run: set `GTM_AGENT_URL` (the GTM agent's production URL) and `GTM_NOTIFY_SECRET` (a long random string, the same value on the agent project, which also needs `GTM_NOTIFY_CHANNEL`) on the workflow project; the link route then lists nothing for them, since they are not keys, so the agent checks `notify` readiness by reading the run's first notification outcome.
- Inbound webhooks: the sender's signing secret goes on the workflow project under the variable the intake names; the sender's endpoint is `https://<host>/api/intake/<slug>`.
- Local `data/gtm.db` and Turso are separate: a local run after a hosted one may re-spend on rows the hosted copy already did; the agent says so when that happens.
- The deployed copy keeps its inlined criteria until the next Update is pushed.

Unverified items and their fallbacks are listed under "Unverified until first deploy" in [local.md](local.md).

## Protected viewer rollout

Follow [viewer.md](viewer.md) for machine access, the share-only companion, immutable workflow identities and grant policy. Configure and deploy the upgraded agent before activating the native gate. Verify harmless Queue/resumption, cron and any signed intake under protection. Deploy the share-only project with `npm run build:share`, production-to-production trust, and only its private origin/project settings. Verify its fixed read proxy before setting `GTM_VIEWER_SHARE_ORIGIN` on the private runtime and redeploying to expose Share.
