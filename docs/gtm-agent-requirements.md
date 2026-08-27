# GTM agent requirements for workflow v4

This is the host contract for a small Eve Slack agent that authors, deploys, and runs the v4 `gtm-workflow` project in one connected GTM workspace.

## What belongs in the reusable gtm-agent template

The template owns the mechanism:

- Slack is the only channel.
- `apply_gtm_workspace_changes` is the only authored write tool. It saves one approved atomic commit to `main`.
- `deploy_gtm_workflows` has a read-only preview action and an approval-gated deploy action.
- `operate_gtm_workflow` has read-only preview and status actions plus approval-gated start and approval actions.
- One host module validates the exact workspace HEAD, reads only tracked `workflows/` source, applies committed migrations, calls the fixed Vercel project, and strips input, hook tokens, webhook URLs, and credentials from results.
- The sandbox remains deny-all except npm, the workspace Turso host, the Gateway host, and accepted provider hosts. It never receives Vercel deployment access, the production run bearer, the OIDC token, or hook tokens.

Save, deploy, and run are separate states. A commit to `main` does not deploy the non-Git-connected workflow project.

## What belongs in each downstream Eve deployment

The downstream repository owns the identity and fixed deployment values:

- its agent name, model, Slack response budget, and retention settings;
- `SLACK_CONNECTOR`, `GITHUB_CONNECTOR`, and `GTM_WORKSPACE_REPOSITORY`;
- its Turso database pair and optional workflow Gateway key/provider hosts;
- the existing Vercel workflow team ID, project ID, project name, and production URL;
- a Vercel access token for that one host deployment and the existing workflow `GTM_RUN_SECRET`;
- a Vercel Trusted Sources rule that lets this Eve production project call the protected workflow production project with OIDC.

Do not hard-code a customer's IDs, URLs, repository, tokens, model, identity, or Slack budget in `gtm-agent`.

## Host environment

The sandbox runtime uses:

```text
GTM_SANDBOX=1
GTM_AGENT_BACKEND=api
TURSO_DATABASE_URL=<workspace database URL>
AI_GATEWAY_API_KEY=brokered-at-sandbox-firewall  # only when configured
```

The Eve host may additionally hold this all-or-nothing production-control set:

```text
GTM_WORKFLOW_VERCEL_TEAM_ID=team_...
GTM_WORKFLOW_VERCEL_PROJECT_ID=prj_...
GTM_WORKFLOW_VERCEL_PROJECT=<project-name>
GTM_WORKFLOW_VERCEL_URL=https://<production-host>
GTM_WORKFLOW_VERCEL_TOKEN=<host-only token>
GTM_WORKFLOW_RUN_SECRET=<host-only production bearer>
```

The Turso token and workflow Gateway key stay at the sandbox firewall. The production-control set stays in the Eve host. Only the database URL and non-secret Gateway placeholder enter the sandbox environment.

## Deployment control

The preview action must:

1. Verify a clean connected checkout on `main` at the requested full commit ID.
2. Run the v4 workflow check.
3. Collect only `git ls-files -- workflows/`, reject links and bounds violations, and remove the `workflows/` prefix.
4. Verify `package.json` deployment metadata against the fixed host configuration.
5. Verify required production environment variable names without reading or returning their values.
6. Report file count, bytes, migration count, library version, and validation status.

The approved deploy action repeats that preview, applies committed Turso migrations through the brokered sandbox connection, uploads the tracked file set through the Vercel API in the host, creates a production deployment tagged with the workspace HEAD, and waits for `READY` or `ERROR`.

The workflow Vercel project stays non-Git-connected. `api.vercel.com` stays closed to the sandbox.

## Run control

The preview action runs the committed workflow's zero-spend dry run against one ignored `workflows/data/*.json` input and reports rows, stages, projected cost, caps, and checkpoint.

The approved start action repeats the dry run, verifies that the production domain currently serves a `READY` deployment tagged with the same workspace HEAD, reads the bounded ignored input, then calls the production route with both:

- the host-only `GTM_WORKFLOW_RUN_SECRET` bearer;
- a short-lived `x-vercel-trusted-oidc-idp-token` from the Eve production deployment.

Status returns the public run key and sanitized business state. Approval fetches the pending run, resolves its hook token internally, submits the accepted decision, and never returns the token.

## Draft and checkout paths

Draft new scaffolds under `$HOME/.gtm-scratch/<repo>/workflows/`. Submit accepted tracked files through `apply_gtm_workspace_changes`. These checkout paths remain ignored and writable:

```text
node_modules/
.env
.env.turso
.workflow-data/
.nitro/
.output/
data/
```

The sandbox runs no remote Git command, exposes no port, and opens no custom workflow UI or Drizzle Studio.

## Setup that remains manual

The host tools operate an existing project. A human still creates or selects the Vercel workflow project, installs Turso, supplies provider and Gateway credentials, creates the Vercel access token, and configures the cross-project Trusted Sources rule. These choices affect billing or grant new authority, so they are not inferred from a Slack request.
