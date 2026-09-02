# GTM agent requirements for workflow v13

This is the host contract for a small Eve Slack agent that authors the v13 `gtm-workflow` project in one connected GTM workspace and runs it on Vercel. Vercel deploys the workflow project from that same repository. The sandbox never starts a real run.

This contract tracks the workflow library major version: refresh it in the same reviewed change as every `gtm-lib` bump, so it never describes a project shape the skill no longer authors.

## What belongs in the reusable gtm-agent template

The template owns the mechanism:

- Slack is the only channel.
- `apply_gtm_workspace_changes` is the only authored write tool. Its request names every migration, includes full SQL for non-additive statements, and declares `DELETE`, `UPDATE`, `RENAME`, `DROP`, and `CREATE TRIGGER` destructive. It applies accepted migrations through a write credential that exists only for that step and saves one approved atomic commit to `main`. If the commit fails after migrations applied, the result says so.
- `operate_gtm_workflow` has read-only preview and status actions plus approval-gated start, approval, and cancel actions. Start carries the rows and projected cost the approver saw and refuses when the fresh dry run disagrees.
- One host module dry-runs the exact workspace HEAD, waits until the protected production runtime reports that same Git SHA, starts it with a required atomic SHA recheck, and strips input, public webhook URLs, and credentials from results.
- The sandbox remains deny-all except npm, the workspace Turso host with a read-only credential, and accepted provider hosts without credentials. It never receives the production run bearer, OIDC token, a Gateway key, or a database write credential. It authors, validates, dry-runs, and queries; it starts no real run.

For `Runs: on Vercel`, save and deploy are one state transition: the accepted `main` commit starts Vercel's Git deployment. A real run remains a separate approval.

## What belongs in each downstream Eve deployment

The downstream repository owns the identity and fixed deployment values:

- its agent name, model, Slack response budget, and retention settings;
- `SLACK_CONNECTOR`, `GITHUB_CONNECTOR`, and `GTM_WORKSPACE_REPOSITORY`;
- the verified Git commit-author name and email connected to the Vercel project owner;
- its Turso database URL, write token, and read-only token, plus optional provider hosts;
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
```

The host holds the database pair and a read-only token:

```text
TURSO_DATABASE_URL=<workspace database URL>
TURSO_AUTH_TOKEN=<write token, brokered only inside the approval-gated migration step>
TURSO_READ_ONLY_AUTH_TOKEN=<read-only token, brokered for every session>
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

The read-only Turso token stays at the sandbox firewall for every session; the write token is injected only while the approved save applies migrations and is withdrawn before the commit. No Gateway key enters the sandbox: model calls happen on Vercel with the workflow project's own budgeted key. The run set stays in the Eve host. Only the database URL enters the sandbox environment. There is no Vercel deployment token.

## Save and deployment

The save proposal must state that accepting a Vercel-workflow batch commits it to `main` and starts production deployment.

Inside the one approval-gated write operation, the host:

1. verifies the connected checkout and remote `main` still match the requested full commit ID;
2. verifies the declared migration list matches the SQL additions, requires full SQL for non-additive changes, and checks every destructive keyword declaration;
3. stages the accepted tracked `workflows/` tree outside the checkout;
4. opens the write credential, applies new committed migrations to the workspace Turso database, and restores the read-only baseline;
5. creates the one atomic GitHub commit with the configured Vercel-recognized author and the GitHub App as committer; and
6. refreshes the checkout to the returned SHA.

Migrations are backward-compatible and never run as a Vercel build side effect. If migration succeeds but commit or deployment fails, the old production code must remain valid, and the tool result states that the migrations were already applied so a retry re-proposes the same batch.

Vercel's Git integration deploys the commit. `api.vercel.com` stays closed to both Eve and the sandbox.

## Run control

Preview imports the committed workflow, validates its exported Zod input, performs the zero-spend dry run against one ignored input file, and reports parsed rows, stages, projected cost, caps, and checkpoint.

Start repeats the dry run, refuses when its rows or projected cost differ from the values the approver accepted, then polls the protected `GET /api/deployment` route until it returns the requested workspace SHA. It reads the bounded ignored input and calls the production route with:

- the host-only `GTM_WORKFLOW_RUN_SECRET` bearer;
- a short-lived `x-vercel-trusted-oidc-idp-token` from the Eve production deployment; and
- `x-gtm-workspace-head` carrying the same SHA.

The production POST route rejects a missing header with `409 deployment_head_required` and a mismatch with `409 deployment_not_ready`, closing the race between readiness polling and start. A timeout starts nothing.

Status returns the public run key and sanitized business state, including `completed`, `stopped`, `timed_out`, `cancelling`, `failed`, or `cancelled`, plus stop reason, remaining keys, failed step, and cost sources. Approval fetches the pending run and submits one typed decision; the token only names that pending stage. Cancel posts to the bearer-protected route, polls through `cancelling` to `cancelled`, and treats `409 run_not_active` as already finished.

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

The sandbox runs no remote Git command, exposes no port, starts no local workflow server or real run, and opens no custom workflow UI or Drizzle Studio.

## Workspace set-up from the hosted surface

A connected repository may start with only a README: `main` exists with at least one commit, and the root has neither `ORG.md` nor legacy `org.md`. The host treats this as "not set up yet", not as a configuration error.

The host must:

1. hydrate and verify that checkout exactly as it would a populated one, so the agent can read it and the skill can see that the organization file is missing;
2. refuse every `apply_gtm_workspace_changes` request against that checkout unless its manifest writes root `ORG.md`, so the first saved change is the scaffold;
3. declare in its standing instructions which Create steps the environment answers: git is present, the checkout is the target with no local collision check, no git init or repo-local identity is set, the sharing question is skipped, and the first save carries `ORG.md` with `AGENTS.md`, `CLAUDE.md`, and `.gitignore` from the skill templates;
4. keep refusing creation of a different repository, import, sharing setup, and whole-repository deletion exactly as before.

The README and any other file outside the workspace path contract stay untouched. The write tool, approval order, credential brokering, and commit path do not change.

## Setup that remains manual

A human initially creates the workspace repository on GitHub (a new repository with "Add a README file" is enough), creates or selects the Vercel workflow project, connects the workspace repository, selects the `workflows` root and `main` production branch, supplies a verified Git author identity, installs Turso, supplies provider and Gateway credentials, enables system environment variables, and configures the cross-project Trusted Sources rule. These choices affect billing or grant new authority, so they are not inferred from a Slack request.
