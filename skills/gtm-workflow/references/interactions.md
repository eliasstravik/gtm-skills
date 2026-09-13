# Interactions: gtm-workflow

Contents: [Create](#create) · [Create without a connected project](#create-without-a-connected-project) · [Create on a hosted agent](#create-on-a-hosted-agent) · [Update](#update) · [Run](#run) · [Deploy](#deploy) · [Run on the deployed copy](#run-on-the-deployed-copy) · [Run on the deployed copy, key absent](#run-on-the-deployed-copy-key-absent) · [Upgrade](#upgrade) · [Delete](#delete)

## Create

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and no workflows yet. Claude Code is installed on this machine; no AI Gateway key is present.

**Human:** Build a workflow that scores our inbound companies against Lean B2B SaaS.

**Agent:** Where do the companies come from?

1. Web addresses you give me, kept as the workflow's list; you can add more any time (Recommended)
2. A data provider queried on every run, which needs that provider's key
3. A table another workflow fills

**Human:** 1: brightpath.io, quillhr.com, northfield.co

**Agent:** Run AI steps on your Claude or Codex subscription (this machine only), or through AI Gateway (works hosted too)?

1. Claude Code subscription: this machine only, no key needed (Recommended)
2. AI Gateway: works hosted too; needs a Gateway key

**Human:** 1

**Agent:** Building it now; about two minutes, since this is Acme's first workflow. Score inbound accounts scores your three companies against Lean B2B SaaS on your Claude Code subscription, about $0.01 each, capped at 200 rows or $5 per run.
[Open diagram](http://localhost:3939/gtm/score-inbound-accounts) · [Open runs](http://localhost:3939/_workflow) · [Open data](https://local.drizzle.studio)

Saved.

**Human:** Run it.

**Agent:** The workflow is new, so a test on one row costs about $0.01 and shows a result before the full list. The full run is 3 rows × about $0.01, about $0.03, under the $5 cap. Nothing is missing.

1. Test one row now (Recommended)
2. Run all 3 now
3. Not now

**Human:** 3

**Agent:** Nothing has run. Say "run Score inbound accounts" whenever you're ready.

**Files:**
- created `workflows/` (the runtime, copied from the skill's template; its installed packages and local database are not committed)
- created `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/workflows/index.ts`
- created `workflows/db/tables/inbound-scores.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0001_inbound_scores.sql` (with its journal and snapshot entries)

## Create without a connected project

**Setup:** Workspace Acme is a shared checkout on a host without local runs; it has the ICP Lean B2B SaaS and no workflows. No workflow project is connected yet.

**Human:** Build a workflow that scores our inbound companies against Lean B2B SaaS.

**Agent:** Where do the companies come from?

1. Web addresses you give me, kept as the workflow's list; you can add more any time (Recommended)
2. A data provider queried on every run, which needs that provider's key
3. A table another workflow fills

**Human:** 1: brightpath.io, quillhr.com, northfield.co

**Agent:** Building it now; about two minutes, since this is Acme's first workflow. Score inbound accounts scores your three companies against Lean B2B SaaS through AI Gateway, about $0.01 each, capped at 200 rows or $5 per run.

Saved.

Runs happen on the hosted copy, which needs a Vercel project connected to the Acme repository once; after that every save deploys by itself. To connect it:

1. In Vercel, create a project from the Acme repository with root directory `workflows`, production branch `main`, Node 22.
2. In its dashboard: connect a Turso database from the marketplace; add `GTM_RUN_SECRET` and `CRON_SECRET` (long random strings you choose), `GTM_MODEL` as `openai/gpt-5.6-luna`, and `AI_GATEWAY_API_KEY`; turn Deployment Protection off for production; then Redeploy the latest deployment.
3. Give the person who runs this agent the project's production address, the same `GTM_RUN_SECRET`, and a read-only Turso token with the database address, for the agent's settings.

Once that is in place, ask me to run it and I'll test one row first.

**Files:**
- created `workflows/` (the runtime, from the template, with `package-lock.json`)
- created `workflows/workflows/score-inbound-accounts.ts`
- created `workflows/db/tables/inbound-scores.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0001_inbound_scores.sql`

## Create on a hosted agent

**Setup:** Workspace Acme is a shared checkout on a host without local runs; its workflow project is connected. The host exposes a Monid connection, and Monid's key is on the workflow project, which the agent cannot see.

**Human:** Create a workflow: given a LinkedIn profile address, enrich the profile and find the work email through Monid.

**Agent:** Building it now; about three minutes, since the hosted copy deploys as part of the save. Enrich LinkedIn profiles takes profile addresses you give at run time, enriches each through Monid's ContactOut lookup, about $0.26 per row, capped at 200 rows or $5 per run.

Saved.

Live on the hosted copy. Ask me to run it and I'll test one profile first.
[Open diagram](https://gtm-acme.vercel.app/gtm/enrich-linkedin-profiles?t=…) (shareable, valid 7 days) · [Open runs](https://vercel.com/acme/gtm-acme/observability/workflows) · [Open data](https://app.turso.tech/acme/databases/gtm-acme/data)

**Files:**
- created `workflows/workflows/enrich-linkedin-profiles.ts`
- created `workflows/db/tables/linkedin-enrichments.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0001_linkedin_enrichments.sql` (with its journal and snapshot entries)

## Update

**Setup:** Workspace Acme exists with the workflow Score inbound accounts, built above, and its runtime is running. Lean B2B SaaS has changed since the workflow was created.

**Human:** Let's look at Score inbound accounts.

**Agent:** Score inbound accounts: what would you like to do?

1. Update it
2. Run it
3. Deploy it
4. Upgrade the runtime
5. Delete it
6. Create another workflow

**Human:** Update it: use the current Lean B2B SaaS criteria, and also save each company's headcount.

**Agent:** Where should the headcount come from?

1. The company's public site, free, left blank when it isn't stated (Recommended)
2. A Crustdata lookup, about $0.02 per row, filled for every company

**Human:** 1

**Agent:** Updating now: the current Lean B2B SaaS criteria, plus a headcount column read from the page it already fetches. The next run offers a one-row test first.
[Open diagram](http://localhost:3939/gtm/score-inbound-accounts) · [Open runs](http://localhost:3939/_workflow) · [Open data](https://local.drizzle.studio)

Saved.

**Files:**
- changed `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/db/tables/inbound-scores.ts`
- created `workflows/drizzle/0002_inbound_scores_headcount.sql` (with its journal and snapshot entries)

## Run

**Setup:** Workspace Acme exists with Score inbound accounts, changed since its last run. Its list has grown to 37 companies; one of them, Brightpath, was scored this morning.

**Human:** Run Score inbound accounts.

**Agent:** This workflow changed since its last run. A one-row test costs about $0.01. The full run is 37 rows, 1 already scored today, so 36 × about $0.01, about $0.36, under the $5 cap. Nothing is missing.

1. Test one row first (Recommended)
2. Run all 36 now
3. Not now

**Human:** 1

**Agent:** Done: 1 company scored, Quill HR at 78, Good ("matches on all but headcount, 230 against a 200 ceiling"); 0 failed; 1 skipped (Brightpath, scored this morning); cost $0.01.

**Human:** Run the rest.

**Agent:** Running the remaining 35 rows, about $0.35.

Done: 34 companies scored; 1 failed (Northfield's site couldn't be reached; it will be tried again on the next run); 2 skipped (Brightpath and Quill HR, scored today); cost $0.35.
[Open diagram](http://localhost:3939/gtm/score-inbound-accounts) · [Open runs](http://localhost:3939/_workflow) · [Open data](https://local.drizzle.studio)

**Files:** none (runs write to the local database, not to the workspace)

## Deploy

**Setup:** Workspace Acme is shared as the private GitHub repository gtm-acme and has Score inbound accounts, which scores on the Claude Code subscription. No workflow project is connected yet.

**Human:** Put Score inbound accounts on a weekly schedule, hosted, Monday mornings.

**Agent:** Hosted runs happen on Vercel, and the scoring step currently uses your Claude Code subscription, which works only on this machine.

1. Switch scoring to AI Gateway (gpt-5.6-luna, about $0.01 per row) and host it (Recommended)
2. Schedule it on this machine instead; it runs while your computer is on
3. Not now

**Human:** 1

**Agent:** Switching scoring to AI Gateway and adding the Monday 08:00 UTC schedule now. Hosting needs a Vercel project connected to the gtm-acme repository once; after that every save deploys by itself. To connect it:

1. In Vercel, create a project from the gtm-acme repository with root directory `workflows`, production branch `main`, Node 22.
2. In its dashboard: connect a Turso database from the marketplace; add `GTM_RUN_SECRET` and `CRON_SECRET` (copy them from `workflows/.env`; I won't print them), `GTM_MODEL` as `openai/gpt-5.6-luna`, and `AI_GATEWAY_API_KEY`; turn Deployment Protection off for production; then Redeploy the latest deployment.
3. Add to `workflows/.env`: `GTM_WORKFLOW_URL` (the project's production address), `TURSO_STUDIO_URL` (the database address with `libsql://` replaced by `https://`), and `TURSO_STUDIO_TOKEN` (a read-only token from Turso).

Tell me when that's done and I'll check that the deployment is live.

Saved.

**Human:** Done.

**Agent:** Live: Score inbound accounts runs every Monday at 08:00 UTC on Vercel. The hosted copy keeps its own copy of the criteria until you update the workflow.
[Open diagram](https://gtm-acme.vercel.app/gtm/score-inbound-accounts?t=…) (shareable, valid 7 days) · [Open runs](https://vercel.com/acme/gtm-acme/observability/workflows) · [Open data](https://app.turso.tech/acme/databases/gtm-acme/data)

**Files:**
- changed `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/vercel.json`
- changed `workflows/.env` (by you, not committed)

## Run on the deployed copy

**Setup:** Workspace Acme's project is connected and Score inbound accounts is live and unchanged since its last run. Its list has 3 companies.

**Human:** Run Score inbound accounts on the hosted copy.

**Agent:** The hosted copy is current with your last save. The full run is 3 rows × about $0.01, about $0.03, under the $5 cap; hosted results live in the hosted database, separate from this computer's.

1. Run all 3 hosted now (Recommended)
2. Test one row hosted first
3. Not now

**Human:** 1

**Agent:** Done on the hosted copy: 3 companies scored, Brightpath 90, Quill HR 78, Northfield 55; 0 failed; 0 skipped; cost $0.03.
[Open diagram](https://gtm-acme.vercel.app/gtm/score-inbound-accounts?t=…) (shareable, valid 7 days) · [Open runs](https://vercel.com/acme/gtm-acme/observability/workflows) · [Open data](https://app.turso.tech/acme/databases/gtm-acme/data)

**Files:** none (runs write to the hosted database, not to the workspace)

## Run on the deployed copy, key absent

**Setup:** As above, but Monid's key was never added to the workflow project.

**Human:** Test one profile.

**Agent:** Not started: the hosted copy has no Monid key, so every row would fail. Add `MONID_API_KEY` in the workflow project's settings and Redeploy, then ask me again and I'll test one profile first.

**Files:** none

## Upgrade

**Setup:** Workspace Acme's workflow runtime was set up by an earlier version of this skill; a newer version is now installed.

**Human:** Upgrade the workflow runtime.

**Agent:** Your runtime is behind the installed skill: three shared files and two packages. Upgrading replaces shared code only; your workflows, tables, data, schedules, and keys stay as they are.

1. Upgrade now (Recommended)
2. Show me what changes first
3. Not now

**Human:** 1

**Agent:** Upgrading now. Verified: the runtime starts and the diagram opens; the hosted copy updates as this save deploys.

Saved.

**Files:**
- changed `workflows/lib/rows.ts`
- changed `workflows/server/routes/gtm/[slug].get.ts`
- changed `workflows/nitro.config.ts`
- changed `workflows/package.json`
- changed `workflows/package-lock.json`

## Delete

**Setup:** Workspace Acme exists with Score inbound accounts, deployed with a Monday schedule; its table inbound_scores holds 37 rows.

**Human:** Delete Score inbound accounts.

**Agent:** Removing Score inbound accounts and its Monday schedule now; the table inbound_scores keeps its 37 rows.

Deleted Score inbound accounts; it stays in history, ask me to restore it. The hosted copy drops it as this save deploys.

**Files:**
- deleted `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/vercel.json`
