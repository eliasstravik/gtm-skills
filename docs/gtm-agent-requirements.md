# GTM agent requirements for workflow v3

This document defines the host changes required for the separate sandbox agent to run the v3 workflow skill. It does not change that repository.

## Contents

- [Session environment](#session-environment)
- [Credentials and brokering](#credentials-and-brokering)
- [Egress allowlist](#egress-allowlist)
- [Deploying](#deploying)
- [Draft and checkout paths](#draft-and-checkout-paths)
- [Runtime behavior](#runtime-behavior)
- [Trust obligations](#trust-obligations)
- [Repository sync changes](#repository-sync-changes)
- [Resource note](#resource-note)

## Session environment

Set these values for every workflow session:

```text
GTM_SANDBOX=1
GTM_AGENT_BACKEND=api
TURSO_DATABASE_URL=<workspace database URL>
```

The database URL is not a credential. Without it, `getDb()` selects a file URL and refuses the sandbox run. Give each workspace its own database.

## Credentials and brokering

The host currently brokers credentials per HTTPS host at the sandbox firewall so tokens do not enter the VM. Provider adapters may omit their authorization header under `GTM_SANDBOX=1` when the host injects it.

The Turso token, Gateway key, and production run bearer each support two delivery modes:

1. Broker the `Authorization` header for the exact host. This is preferred. The libsql client maps a `libsql:` URL to HTTPS transport. For the Gateway, set `AI_GATEWAY_API_KEY` to a non-empty placeholder so the local check passes while the firewall replaces the header.
2. Put the value in the session environment.

A sandbox-local `.env` gets a fresh `GTM_RUN_SECRET`. The production bearer is needed only when `gtm run`, `gtm runs get`, or `gtm approve` targets a workflow whose header says `Runs: on Vercel`.

## Egress allowlist

Allow these hosts per session:

- the npm registry because `npm ci` runs after the session checkout exists;
- the workspace Turso host;
- the Gateway host;
- every provider host used by an accepted adapter;
- `api.vercel.com` only when deployment is enabled.

Keep the default deny-all policy for other network access.

## Deploying

The sandbox image does not include the Vercel CLI, and the normal deploy flow waits for keyboard login. To deploy from the sandbox, the host must make the CLI available through bootstrap and provide or broker a deploy-scoped Vercel credential. Until both exist, sandbox workflows run as `Runs: on this computer` against Turso.

Deployment authority remains a trusted host action. The sandbox does not gain general production access.

## Draft and checkout paths

Build a new scaffold under `$HOME/.gtm-scratch/<repo>/workflows/`. Submit only accepted tracked files through the host approval tool and reuse the scratch project for the rest of the session.

When a later session receives the scaffold in its checkout, these ignored paths must be writable without approval:

```text
node_modules/
.env
.env.turso
.workflow-data/
.nitro/
.output/
data/
```

The agent runs no remote Git command in sandbox mode. The host owns durable repository writes.

## Runtime behavior

Sandbox `nitro dev` writes to the same Turso database as production. Upsert by workflow row `key` keeps business rows idempotent, and `workflow_runs` records the origin and run identity.

A background dev server does not survive an idle snapshot. Answer a local checkpoint or approval within the same session. Put approval workflows on Vercel when a pause must survive the session.

Expose no sandbox port. Relay run and row state with:

```text
npm run gtm -- runs get <runId|runKey>
npm run gtm -- query --sql "select * from <table> limit 20" --format markdown
npx workflow inspect run <runId> --json
npx workflow inspect hooks --runId <runId>
```

Drizzle Studio stays on the user's machine or the user inspects through the Turso dashboard.

## Trust obligations

- The sandbox holds no deployment authority or production secret beyond the exact brokering above.
- Commit, deploy, and approval delivery remain trusted host tools.
- The host enforces per-person approval authorization at the Slack channel. The v3 approve route accepts any holder of the run bearer.
- The host exposes no sandbox port and adds no custom workflow UI.

## Repository sync changes

Update the sync script remote to:

```text
https://github.com/eliasstravik/gtm-skills.git
```

Set `EXPECTED_SKILLS` to the directories at the synced commit. At this handoff they are `gtm-workspace`, `gtm-icp`, `gtm-persona`, and `gtm-workflow`.

Revise the downstream `AGENTS.md` rules that currently prohibit a database and schedules. The database is the user's Turso database and schedules are Vercel Cron on the user's project. Keep the bans on a custom UI, exposed ports, and unbrokered connector credentials. When the host chooses session-environment delivery, document that exception to the connector-token rule.

## Resource note

One vCPU is enough for `nitro dev`, migration checks, and small validation runs. Production workloads should use `Runs: on Vercel`.
