# Interactions: gtm-workflow

## Bare entry

User: /gtm-workflows
Agent: What would you like to do?

1. Open GTM Workflows
2. Create a workflow
3. Manage a workflow

Wait for the choice. The singular /gtm-workflow behaves the same. Choosing Manage asks which workflow and action; an explicit "run Score companies" goes directly to Run with its existing run safeguards. Open with no workspace explains setup; Open with no saved workflows opens the empty list.

Contents: [Create](#create) · [Create without a connected project](#create-without-a-connected-project) · [Create on a hosted agent](#create-on-a-hosted-agent) · [Create with plain steps](#create-with-plain-steps) · [Create an agent stage](#create-an-agent-stage) · [Update](#update) · [Run](#run) · [Deploy](#deploy) · [Run on the deployed copy](#run-on-the-deployed-copy) · [Run on the deployed copy, key absent](#run-on-the-deployed-copy-key-absent) · [Upgrade](#upgrade) · [Delete](#delete)

## Create

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and no workflows yet; the checkout is linked to Vercel, so the Gateway needs no key locally.

**Human:** Build a workflow that scores our inbound companies against Lean B2B SaaS.

**Agent:** Where do the companies come from?

1. Web addresses you give me, kept as the workflow's list; you can add more any time (Recommended)
2. A data provider queried on every run, which needs that provider's key
3. A table another workflow fills

**Human:** 1: brightpath.io, quillhr.com, northfield.co

**Agent:** Building it now; about two minutes, since this is Acme's first workflow. Score inbound accounts scores your three companies against Lean B2B SaaS through AI Gateway, about $0.01 each, capped at 200 rows or $5 per run.

Created Score inbound accounts.
[Open GTM Workflows](http://127.0.0.1:3939/viewer?workflow=example-score-inbound-accounts)

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

Created Score inbound accounts.

Runs happen on the hosted copy, which needs a Vercel project connected to the Acme repository once; after that every save deploys by itself. To connect it, a teammate with the GitHub and Vercel CLIs signed in says to their coding agent: "connect the workflow project for Acme". That creates the project and its database and wires this agent to it; nothing to paste anywhere.

Once that is in place, ask me to run it and I'll offer a one-row test first.

**Files:**

- created `workflows/` (the runtime, from the template, with `package-lock.json`)
- created `workflows/workflows/score-inbound-accounts.ts`
- created `workflows/db/tables/inbound-scores.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0001_inbound_scores.sql`

## Create on a hosted agent

**Setup:** Workspace Acme is a shared checkout on a host without local runs; its workflow project is connected. The host exposes a Monid connection, and Monid's key is on the workflow project, which the agent cannot see.

**Human:** Create a workflow: given a LinkedIn profile address, enrich the profile and find the work email through Monid, and ask me before each paid lookup.

**Agent:** Which Slack channel should it post approval requests in? Say "here" for this one, or give a channel id (bottom of the channel's About tab).

**Human:** here

**Agent:** Building it now; about three minutes. Enrich LinkedIn profiles takes profile addresses you give at run time, enriches each through Monid's ContactOut lookup, about $0.26 per row, capped at 200 rows or $5 per run.

Created Enrich LinkedIn profiles; it asks in this channel before each paid lookup.

Live. Ask me to run it and I'll test one profile first.
[Open GTM Workflows](https://gtm-acme.vercel.app/viewer?workflow=example-enrich-linkedin-profiles)

**Files:**

- created `workflows/workflows/enrich-linkedin-profiles.ts`
- created `workflows/db/tables/linkedin-enrichments.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0001_linkedin_enrichments.sql` (with its journal and snapshot entries)

## Create with plain steps

**Setup:** Workspace Acme is a shared checkout on a host without local runs; its workflow project is connected. The agent knows this conversation's channel id.

**Human:** Build a workflow: I give it a work email, it takes the domain and posts it here.

**Agent:** Building it now; about three minutes. Post email domain takes emails you give at run time, reads the domain off each, and posts it in this channel; no AI and nothing paid, capped at 100 rows per run.

Created Post email domain.

Live. Ask me to run it on an email and it runs straight away.
[Open GTM Workflows](https://gtm-acme.vercel.app/viewer?workflow=example-post-email-domain)

**Human:** Run it on simon@ophena.com.

**Agent:** Running it on simon@ophena.com now; free.

Done: posted ophena.com in this channel.

**Files:**

- created `workflows/workflows/post-email-domain.ts`
- created `workflows/db/tables/email-domains.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0002_email_domains.sql` (with its journal and snapshot entries)

## Create an agent stage

**Setup:** Workspace Acme is a shared checkout on a host without local runs; its workflow project is connected and its link route lists `MONID_API_KEY` and `AI_GATEWAY_API_KEY`.

**Human:** Build a workflow that takes a work email and researches the person through Monid, like a research agent would: find the right endpoint, run it, then corroborate on LinkedIn and the web.

**Agent:** Building it now; about three minutes. Research people by email takes emails you give at run time and sends an agent through Monid's tools for each, up to 12 tool turns, about $0.30 and 5 minutes per row, capped at 200 rows or $20 per run.

Created Research people by email.

Live. Ask me to run it and I'll test one email first.
[Open GTM Workflows](https://gtm-acme.vercel.app/viewer?workflow=example-research-people-by-email)

**Human:** Test one: priya@quillhr.com.

**Agent:** Running it on priya@quillhr.com now; about $0.30.

Done: Priya Nair, Head of Revenue Operations at Quill HR, London; matched. The agent made 5 tool calls (discover, inspect, run, get_run, inspect) and stopped when it had the answer; cost $0.21, of which $0.18 was Monid.

**Files:**

- created `workflows/workflows/research-people-by-email.ts`
- created `workflows/db/tables/person-research.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/db/tables/index.ts`
- created `workflows/drizzle/0002_person_research.sql` (with its journal and snapshot entries)

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

**Agent:** Updating now: the current Lean B2B SaaS criteria, plus a headcount column read from the page it already fetches. The next run of the full list offers a one-row test first.

Updated Score inbound accounts.
[Open GTM Workflows](http://127.0.0.1:3939/viewer?workflow=example-score-inbound-accounts)

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

**Files:** none (runs write to the local database, not to the workspace)

## Deploy

**Setup:** Workspace Acme is shared as the private GitHub repository gtm-acme and has Score inbound accounts. No workflow project is connected yet.

**Human:** Put Score inbound accounts on a weekly schedule, hosted, Monday mornings.

**Agent:** Adding the Monday 08:00 UTC schedule now. Hosting needs a Vercel project connected to the gtm-acme repository once; after that every save deploys by itself. Say "connect the workflow project for Acme" and I'll create it (the gtm-agent skill does that here: the project, its database, and `GTM_WORKFLOW_URL` and `GTM_RUN_SECRET` in `workflows/.env`), then check that the deployment is live.

Updated Score inbound accounts: scheduled Mondays at 08:00 UTC.

**Human:** Done.

**Agent:** Live: Score inbound accounts runs every Monday at 08:00 UTC on Vercel. It keeps its own copy of the criteria until you update the workflow.
[Open GTM Workflows](https://gtm-acme.vercel.app/viewer?workflow=example-score-inbound-accounts)

**Files:**

- changed `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/vercel.json`
- changed `workflows/.env` (by the connection, not committed)

## Run on the deployed copy

**Setup:** Workspace Acme's project is connected and Score inbound accounts is live and unchanged since its last run. Its list has 3 companies.

**Human:** Run Score inbound accounts on the hosted copy.

**Agent:** Your last save is live. The full run is 3 rows × about $0.01, about $0.03, under the $5 cap; hosted results live in the hosted database, separate from this computer's.

1. Run all 3 hosted now (Recommended)
2. Test one row hosted first
3. Not now

**Human:** 1

**Agent:** Done: 3 companies scored, Brightpath 90, Quill HR 78, Northfield 55; 0 failed; 0 skipped; cost $0.03.

**Files:** none (runs write to the hosted database, not to the workspace)

## Run on the deployed copy, key absent

**Setup:** As above, but Monid's key was never added to the workflow project.

**Human:** Test one profile.

**Agent:** Not started: there is no Monid key yet, so every row would fail. Add `MONID_API_KEY` in the workflow project's settings and Redeploy, then ask me again and I'll test one profile first.

**Files:** none

## Upgrade

**Setup:** Workspace Acme's workflow runtime was set up by an earlier version of this skill; a newer version is now installed.

**Human:** Upgrade the workflow runtime.

**Agent:** Your runtime is behind the installed skill: three shared files and two packages. Upgrading replaces shared code only; your workflows, tables, data, schedules, and keys stay as they are.

1. Upgrade now (Recommended)
2. Show me what changes first
3. Not now

**Human:** 1

**Agent:** Upgrading now. Verified: the runtime starts and the diagram opens; it goes live with this save.

Upgraded the runtime.

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

Deleted Score inbound accounts; it stays in history, ask me to restore it.

**Files:**

- deleted `workflows/workflows/score-inbound-accounts.ts`
- changed `workflows/workflows/index.ts`
- changed `workflows/vercel.json`
  \n## Open UI

**Human:** Open GTM Workflows UI.

**Agent:** [Open GTM Workflows](verified-viewer-url)

An explicit repeat request receives the same entry again. The URL opens the discussed workflow, or the list without workflow context. No workflow starts. In Slack, the normal final reply carries one primary URL button with this label.\n
