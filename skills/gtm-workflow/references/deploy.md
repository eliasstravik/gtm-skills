# Deploy

Production is an ordinary Vercel project, `gtm-<ws>`, that deploys `workflows/` on every push to `main`. Taking a workspace live is one command, run from the installed skill directory on a computer with `git`, `gh` and `vercel` signed in (and `neonctl` for copy-down):

```sh
node scripts/setup.mjs --deploy --workspace /path/to/gtm-acme --team acme [--workflow-project gtm-acme] [--agent-project gtm-agent-acme] --json
```

It does what a person would do with Vercel's own tools, in this order, skipping every step already done, so it is also the repair and safe to run on a live workspace:

1. The local runtime (as `--local`).
2. The GitHub repository: the workspace's `origin`, else a new private `<gh user>/<folder name>`.
3. The Vercel project (default: the workspace folder's name), git-connected to that repository with root `workflows/`, Node 22, framework Nitro, previews off, no ignored build step (every push to `main` builds), Vercel Authentication on All Deployments.
4. `vercel link` in `workflows/` (refused when Development already holds a database; a link to another project is never replaced).
5. Neon: `vercel integration add neon -e production` ([Database](#database)), run from a scratch folder holding only the link, because the command also installs Neon's agent skills into its working folder. The first time a team adds Neon, Vercel wants its terms accepted in the browser: setup stops with exit 2 and says so; run it again afterwards.
6. Secrets, each made once: `CRON_SECRET`, `GTM_VIEWER_LINK_KEY`, the Keys page's project-scoped token and settings (a `vercel login` session cannot make that token; then setup finishes everything else and ends with exit 2, asking for one made on vercel.com and saved as the Production secret `GTM_CONNECTIONS_VERCEL_TOKEN`); one automation bypass, the one deployments see as `VERCEL_AUTOMATION_BYPASS_SECRET` (extra ones are reported, never used); variables of earlier designs (`GTM_RUN_SECRET`, `GTM_DATA_URL`, `GTM_RUNS_URL`, `GTM_CONNECTIONS_ORIGIN`, `GTM_CONNECTIONS_MANAGED`) are deleted.
7. The public share project `gtm-<ws>-share` (found by the runtime's trust first, so a rename keeps it), its production-to-production trust, both projects' addresses, and its [rate limits](#share-rate-limits).
8. With `--agent-project`: the agent's `GTM_WORKFLOW_URL` and `GTM_WORKFLOW_BYPASS_SECRET`, one `GTM_NOTIFY_SECRET` on both, `GTM_AGENT_URL` on the runtime; the agent is redeployed when any changed.
9. The first push: when `workflows/` is not committed yet, commit it with the root `.gitignore` and `.github/` and push `main`. After that setup never commits.
10. A production deployment of both projects (the push, or a redeploy of the latest `main` when variables changed since the last one), waited for; then the Neon project is saved for copy-down and set to the smallest compute: the project default and every compute pinned at 0.25 CU minimum and maximum with scale to zero, read back to confirm (the integration has no size option, so this uses `neonctl`; a compute Neon would not change ends setup with exit 2 and says what to set). Without `neonctl` signed in the database keeps Neon's defaults, which scale up to 8 CU on a paid plan.

Addresses come from each project's production domain, the same one the app sees as `VERCEL_PROJECT_PRODUCTION_URL`, never from its name. Result: `production_ready` (exit 0), `deploying` (exit 0; a build is still running, run it again later to confirm), or `needs_you` with the one step only a person can do (exit 2). Doctor: `node scripts/doctor.mjs --target production --workspace <path> --json` lists what Vercel does not show at a glance, each with its fix (exit 2 when anything is listed), including a Neon database above 0.25 CU or without scale to zero (`neonCompute` is `unknown` when `data/neon.json` or `neonctl` is missing).

Enter production keys in the deployed Keys page (the private viewer's Connections tab), the Vercel dashboard, or `vercel env add <NAME> production`. Nothing local ever writes production keys.

## Database

The deployed copy's database is Neon Postgres, one per workspace, in the Vercel team that owns the workspace. It is always added through the Neon integration in Vercel, never with hand-set connection strings: connect it to the workflow project only, Production environment only, preview branching off. Its compute is the smallest Neon has, 0.25 CU minimum and maximum, and it sleeps after 5 idle minutes; setup `--deploy` sets this and Doctor flags a database above it or that never sleeps. The one manual step is accepting the Neon marketplace terms the first time a team uses it. The integration sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (used by migrations and the query route); never set, copy or print them. The share project holds no database variable of any kind.

The production build migrates: `npm run build` runs `scripts/migrate.mjs`, which targets the project's database only when `VERCEL_ENV=production`. A preview build never migrates. A local `npm run build` migrates this workspace's own local Postgres when it is running (started by `npm run dev`) and skips migrations when it is not; it never reaches Neon. Migrations only add, because the previous deployment keeps serving (and a failed build leaves it serving) on the new schema. The production build refuses a migration that drops, renames, truncates or retypes something unless its file carries the line `-- gtm: destructive` (add it once no deployed code uses the old shape), and refuses a migration file older than the latest one applied, which drizzle would otherwise skip for good (two people generated at once; regenerate the older one). A migration waits at most 10 seconds for a busy table, then tries again. See [Cost on Neon](local.md#cost-on-neon).

Function time: workflow steps run in the `/.well-known/workflow/v1/flow` function, which `workflow/nitro` builds with `maxDuration: "max"` (800 seconds on Pro with Fluid compute, 300 on Hobby), so a `runNetwork` chunk (100 items, 12 workers, about 40 seconds at Blitz's pace) fits with room to spare. Routes such as `/api/run` only start runs and return at once. Keep chunks at 100: a slower provider needs fewer items per chunk, not a longer function.

## Verify deployment

Every push to `main` builds. Deploy checks readiness in code after the push: poll `GET /api/link/<slug>` on the deployed copy (`vercel curl /api/link/<slug>` from a computer; the hosted agent's host adds the bypass) until `git merge-base --is-ancestor HEAD <commit>` holds for the `commit` it returns, bounded to a few minutes. On timeout, report in plain words; a failed build shows in `vercel inspect <url> --logs`. A host without local runs deploys before its first run.

## Rules

- Node 22 runtime; Vercel Authentication on All Deployments protects the private runtime and viewer. Never disable it to repair an agent call.
- Model access: the deployed copy calls AI Gateway with the Vercel project's OIDC identity (`oidcTokenConfig` on by default); `AI_GATEWAY_API_KEY` is a personal-computer setting for a checkout that is not linked to a Vercel project, never a project variable.
- Hosted data: `POST /api/query` (from a laptop: `vercel curl /api/query -- -X POST -H 'content-type: application/json' -d '{"sql":"select 1"}'`) with `{ sql, args? }` runs one read-only Postgres statement (parameters `$1`, `$2`, …; 5 seconds; at most 1,000 rows and 2 MB leave the database, behind a cursor, whatever the statement says) and returns `{ columns, rows, truncated }`; it is how a host without local runs reads rows, and how a personal computer reads the hosted copy's data. Every byte it returns is Neon data transfer, so name columns and add `LIMIT`. What to write is under [Data](local.md#data).
- Schedules: `vercel.json` `crons` only; Vercel Cron calls `GET /api/run/<slug>` with `Authorization: Bearer <CRON_SECRET>`. `nitro.config.ts` mirrors the same list into the build output as a fallback. Hobby-plan crons run at most daily and the start time can drift within the hour.
- Where to look: `GET /api/link/<slug>` returns the canonical private `viewerUrl`, `intakeUrl` for a workflow with an intake once sharing is set up, and `keys`, the names of the `*_API_KEY` variables on the workflow project; a host without local runs returns Open GTM Workflows after a save that creates or changes a workflow, not after a run, never a localhost link.
- Agent stages on the hosted copy always run through the Gateway: a stage that names a CLI backend in code, or a `GTM_AGENT_BACKEND` on the project, takes the Gateway on Vercel. Go-live copies `GTM_AGENT_BACKEND` from the owner's `workflows/.env` to Production, where it picks only the default model (`lib/models.ts`: claude → Claude Haiku, codex or unset → GPT-6 Luna); run `setup --deploy` again after changing it. A model the user names for the deployed copy goes in `GTM_MODEL` on the project (`vercel env add GTM_MODEL production` in `workflows/`, then redeploy) and wins over the default. No workflow needs an edit to move between the two.
- A push never touches a run already in flight: it finishes on the deployment it started with, and a cancelled parent cancels its child runs. Upgrade lets running runs finish or cancels them first; it does not wait for them.
- Reaching people from a run: set `GTM_AGENT_URL` (the GTM agent's production URL) and `GTM_NOTIFY_SECRET` (a long random string, the same value on the agent project, which also needs `GTM_NOTIFY_CHANNEL`) on the workflow project; the link route then lists nothing for them, since they are not keys, so the agent checks `notify` readiness by reading the run's first notification outcome.
- Inbound webhooks: see [Inbound webhooks](#inbound-webhooks).
- The local database and the hosted one are separate: a local run after a hosted one may re-spend on rows the hosted copy already did; the agent says so when that happens.
- ICPs and personas: the build bakes `icps/` and `personas/` into `lib/criteria.generated.ts`, which `readIcp` and `readPersona` read on the deployed copy, so an edit reaches it with the deployment its push makes. The runtime project has `enableAffectedProjectsDeployments` off for that reason: a push that only changes files outside `workflows/` still rebuilds it.

Unverified items and their fallbacks are listed under "Unverified until first deploy" in [local.md](local.md).

## Inbound webhooks

Names: the workspace's runtime project is `gtm-<ws>` (like its repository) and its public companion `gtm-<ws>-share`. Vercel Authentication stops every outside sender at the runtime, so senders post to the share project instead: `https://gtm-<ws>-share.vercel.app/api/intake/<slug>` (the link route's `intakeUrl`). The relay refuses requests without a signature header, forwards the raw body and the signature headers with the share project's Vercel OIDC identity, which the runtime trusts, and returns the runtime's answer. It holds no secret; the runtime checks the signature and dedupes. Never hand a sender a protection bypass secret: it opens the whole runtime, not only intake.

After building or editing a workflow with an intake, tell the user in plain words:

1. The URL to paste into the sender, from `intakeUrl`: `https://gtm-<ws>-share.vercel.app/api/intake/<slug>`. It carries no secret. If the link route has no `intakeUrl`, sharing is not set up yet; say so and run setup `--deploy`.
2. The signing secret: the sender and the runtime must hold the same value under the intake's `secretEnv` (Cal.com: the webhook's "Secret" field, variable `CAL_WEBHOOK_SECRET`). Let the user make it and paste it themselves, never through the chat: in their own terminal `openssl rand -hex 32` (or any long random string), pasted into the sender's secret field and into Connections as a new secret named after `secretEnv`, saved for Production; then redeploy. Until the variable exists the runtime answers 503; a mismatch answers 401 "Bad signature".
3. The sender's test ping should come back 200 (`ignored`) or 202; a 401 "Signed webhooks only" means the sender sends no signature, so its secret field is empty.

An intake always names `secretEnv` and `signature`; an unsigned intake would let anyone start runs through the public relay.

## Share rate limits

The share project is public on purpose (share links, the share read API, the intake relay), so never turn on Deployment Protection for it. Its firewall rate-limits each IP address instead, from one definition, `templates/share-firewall.json`: `/api/intake/*` 120 a minute, `/api/viewer*` 300, everything else 300, answering 429 over the limit. Real use stays far below (an open share tab reads about 6 times a minute); a flood is cut off, and Vercel does not bill requests the firewall mitigates.

- Hosted setup (`scripts/setup.mjs --deploy`) applies them to the share project and publishes, touching only rules named `GTM share: …`; the project owner's other rules stay. It is idempotent: a matching project is left alone, and a pending unpublished firewall draft stops it with `draft_pending` rather than publishing someone's half-made edit. Its result carries `steps.share.firewall` (`applied`, `current`, `draft_pending`, `failed`).
- Doctor (`scripts/doctor.mjs --target production`) lists drift among its problems, and its `shareFirewall` field says `current`, or `missing`/`differs` with the rule names. Hosted setup repairs it. Upgrade reruns hosted setup, so changed limits in the template roll out with it.
- Spend cap: both also report `spendCap`, the team's Spend Management budget (amount and whether it pauses projects), and warn when there is none or it only alerts. It is a team setting: never change it; tell the owner to add one under Settings > Billing > Spend Management with Pause on. Vercel publishes no API for it, so `unknown` means it could not be read, not that it is off. Marketplace charges such as Neon are outside it.
- The private runtime `gtm-<ws>` needs no share rules: Vercel Authentication answers outsiders before any function runs.

## Removing production

Production is ordinary Vercel: to stop it, delete `gtm-<ws>` and `gtm-<ws>-share` in Vercel (Settings > Advanced) and remove the Neon database from the Storage tab; delete `workflows/.vercel` and `workflows/data/neon.json` locally. The workspace keeps working locally. Setup `--deploy` makes it all again, with a new, empty database.
