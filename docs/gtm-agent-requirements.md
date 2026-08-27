# GTM agent requirements for workflow v5

This is the host contract for a small Eve Slack agent that authors and runs the v5 `gtm-workflow` project in one connected GTM workspace. Vercel deploys the workflow project from that same repository.

## What belongs in the reusable gtm-agent template

The template owns the mechanism:

- Slack is the only channel.
- `apply_gtm_workspace_changes` is the only authored write tool. It applies accepted workflow migrations and saves one approved atomic commit to `main`.
- `operate_gtm_workflow` has read-only preview and status actions plus approval-gated start and approval actions.
- One host module dry-runs the exact workspace HEAD, waits until the protected production runtime reports that same Git SHA, starts it with an atomic SHA recheck, and strips input, hook tokens, webhook URLs, and credentials from results.
- The sandbox remains deny-all except npm, the workspace Turso host, the Gateway host, and accepted provider hosts. It never receives the production run bearer, OIDC token, or hook tokens.

For `Runs: on Vercel`, save and deploy are one state transition: the accepted `main` commit starts Vercel's Git deployment. A real run remains a separate approval.

## What belongs in each downstream Eve deployment

The downstream repository owns the identity and fixed deployment values:

- its agent name, model, Slack response budget, and retention settings;
- `SLACK_CONNECTOR`, `GITHUB_CONNECTOR`, and `GTM_WORKSPACE_REPOSITORY`;
- the verified Git commit-author name and email connected to the Vercel project owner;
- its Turso database pair and optional workflow Gateway key/provider hosts;
- the existing workflow production URL and `GTM_RUN_SECRET`;
- a Vercel Trusted Sources rule that lets this Eve production project call the protected workflow production project with OIDC.

The workflow Vercel project connects to the same workspace repository with Root Directory `workflows`, Production Branch `main`, and builds skipped when `workflows/` is unchanged. It exposes Vercel system environment variables so the runtime receives `VERCEL_GIT_COMMIT_SHA`.

Do not hard-code a customer's URL, repository, tokens, model, identity, or Slack budget in `gtm-agent`.

## Host environment

The sandbox runtime uses:

```text
GTM_SANDBOX=1
GTM_AGENT_BACKEND=api
TURSO_DATABASE_URL=<workspace database URL>
AI_GATEWAY_API_KEY=brokered-at-sandbox-firewall  # only when configured
```

The Eve host may additionally hold this all-or-nothing production run set:

```text
GTM_WORKFLOW_VERCEL_URL=https://<production-host>
GTM_WORKFLOW_RUN_SECRET=<host-only production bearer>
```

Git-deployed workflows also require:

```text
GTM_WORKSPACE_COMMIT_AUTHOR_NAME=<verified Git author name>
GTM_WORKSPACE_COMMIT_AUTHOR_EMAIL=<verified Git author email>
```

The author must map to the Vercel project owner on Hobby, or a project team member on Pro. The GitHub App remains the committer. This keeps bot-created, user-approved commits deployable without giving Eve a Vercel token.

The Turso token and workflow Gateway key stay at the sandbox firewall. The run set stays in the Eve host. Only the database URL and non-secret Gateway placeholder enter the sandbox environment. There is no Vercel deployment token.

## Save and deployment

The save proposal must state that accepting a Vercel-workflow batch commits it to `main` and starts production deployment.

Inside the one approval-gated write operation, the host:

1. verifies the connected checkout and remote `main` still match the requested full commit ID;
2. stages the accepted tracked `workflows/` tree outside the checkout;
3. applies new committed migrations to the brokered workspace Turso database;
4. creates the one atomic GitHub commit with the configured Vercel-recognized author and the GitHub App as committer; and
5. refreshes the checkout to the returned SHA.

Migrations are backward-compatible and never run as a Vercel build side effect. If migration succeeds but commit or deployment fails, the old production code must remain valid.

Vercel's Git integration deploys the commit. `api.vercel.com` stays closed to both Eve and the sandbox.

## Run control

Preview runs the committed workflow's zero-spend dry run against one ignored `workflows/data/*.json` input and reports rows, stages, projected cost, caps, and checkpoint.

Start repeats the dry run, then polls the protected `GET /api/deployment` route until it returns the requested workspace SHA. It reads the bounded ignored input and calls the production route with:

- the host-only `GTM_WORKFLOW_RUN_SECRET` bearer;
- a short-lived `x-vercel-trusted-oidc-idp-token` from the Eve production deployment; and
- `x-gtm-workspace-head` carrying the same SHA.

The production POST route rejects a mismatch with `409 deployment_not_ready`, closing the race between readiness polling and start. A timeout starts nothing.

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

A human initially creates or selects the Vercel workflow project, connects the workspace repository, selects the `workflows` root and `main` production branch, supplies a verified Git author identity, installs Turso, supplies provider and Gateway credentials, enables system environment variables, and configures the cross-project Trusted Sources rule. These choices affect billing or grant new authority, so they are not inferred from a Slack request.
