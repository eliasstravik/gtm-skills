# GTM agent requirements for managed workflows

This is the host contract for a small Eve Slack agent that authors the current `gtm-workflow` template generation in one connected GTM workspace and runs it on Vercel. Vercel deploys the workflow project from that same repository. The sandbox never starts a real run.

This contract covers project 0.7.0, workflow library generation 22. Refresh it with each library bump. It preserves bounded row concurrency, child batches, deployment pinning, workflow shapes, and the Eve reference from generation 21.

## What belongs in the reusable gtm-agent template

The template owns the mechanism:

- Slack is the only channel.
- `apply_gtm_workspace_changes` is the only authored write tool. Its request names every migration, includes full SQL for non-additive statements, and declares `DELETE`, `UPDATE`, `RENAME`, `DROP`, and `CREATE TRIGGER` destructive. It applies accepted migrations through a write credential that exists only for that step and saves one approved atomic commit to `main`. If the commit fails after migrations applied, the result says so.
- Validate the save payload and its manifest before requesting human approval. Return actionable path and operation errors to the agent so it can correct the request. Every valid resubmission still requires human approval, and execution repeats validation before any write. The manifest mapping is defined in [the hosted save procedure](../skills/gtm-workflow/references/deploy.md#before-the-commit).
- `operate_gtm_workflow` has read-only preview and status actions plus approval-gated start, approval, trigger, and cancel actions. Start carries the rows and projected cost the approver saw and refuses when the fresh dry run disagrees. Agent starts also carry `expectedCapabilitiesHash` from the accepted preview; the host refuses missing or changed agent definitions.
- One host module dry-runs the exact workspace HEAD, waits until the protected production runtime reports that same Git SHA, starts it with a required atomic SHA recheck, and strips input, public webhook URLs, and credentials from results.
- Background watch controls persist deployment/run identity and the originating Slack channel plus thread timestamp. They post readiness, checkpoint, completion, failure, and cancellation into that same thread after the foreground tool returns. A bounded foreground wait alone does not satisfy this contract.
- A read-only draft-render control accepts `gtm diagram <slug> --format json` from scratch and uses the managed `renderDiagramPng(graph)` entry in `lib/diagram-svg` with its bundled font. Graph JSON, managed layout, SVG renderer, and font suffice without a deployment, production bearer, or signed URL. Preserve summary, numbered steps, model/provider and cost per row, yes/no questions, business table name, and status legend.
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

For questions about the agent's own capabilities, expose the host's pinned Eve version and declare which agent-source files, if any, its source editor may change. Route permitted edits through that editor's draft-review path and other agent-source work to an external coding session. The [Eve reference](../skills/gtm-workflow/references/eve.md) describes framework capabilities without granting edit authority.

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

The save `summary` for a Vercel-workflow batch ends its workflow description with `Saving this also puts it live in production.`; the host contract no longer requires "commits to `main` and starts production deployment" wording in the summary.

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

Short model calls accept `model` and AI SDK 7 `reasoning`. Precedence is call argument, workflow project's `GTM_WORKFLOW_MODEL`, deprecated `GTM_AGENT_MODEL` through generation 22, then `DEFAULT_WORKFLOW_MODEL`, currently `deepseek/deepseek-v4.1-flash`. API reasoning defaults to high. These settings belong to the workflow deployment, not the Eve host model. Preserve dry-run `paidStages` and the chosen model in every paid-stage proposal. Reject unresolved dynamic model choices before paid approval. Durable agent definitions retain their own model.

Preflight returns non-secret `modelDefaults` from the workflow deployment. Use those defaults in the trusted dry run and draft renderer, with `GTM_AGENT_BACKEND=api` required for hosted execution. Bind `paidStages` to the accepted preview and compare them again at start alongside rows, cost, and execution shape. A changed deployment default must not silently switch models after approval. Eve's own `GTM_AGENT_MODEL` setting is never substituted for the workflow project's deprecated alias.

Trusted preview calls bearer-protected `GET /api/preflight/<workflow>` using the host bearer and OIDC identity. Bind the returned `head` to the accepted version. The route checks environment names from transitive adapter headers, result tables including child workflows, and declared free authentication checks. It returns `ok`, `missing`, and per-provider auth status without credential values or upstream error bodies. Say `credentials and table verified` only when `ok`; otherwise name the missing piece. Disclose `unavailable` free auth checks. Preflight spends nothing. A draft's new tables/adapters cannot be verified on an old deployment: mark them pending in the save preview and recheck on the accepted deployment before smoke approval.

Before the save proposal, run `gtm check` in scratch. It executes declared row cases with `GTM_PROVIDER_MODE=fixture` using adapter fixtures and no credentials, live calls, or database. Missing fixtures are SHOULD FIX findings with paths; failures stop the proposal. This is deterministic template verification, not a skill eval.

Preview and start approval also preserve the dry run's concurrency (`N rows at a time`), batch size/count, and parent deadline. Bind these fields to the accepted preview when starting, alongside rows and cost. Show rounded row checkpoints; batch parents require a small-input preview instead of a row checkpoint. Parent receipts list child statuses, counts, cost, and remaining scope; cancellation stops active children. When saving an update with a waiting hosted run, explain that it finishes on the previous deployment and offer cancellation first.

Agent previews also report selected tools, fixed arguments, destinations, effects, skill revisions, model/tool limits, deadline, and whether cost is estimated. The hash covers the full committed definitions, including skill content. Explain those facts in the same run approval. Workflow agents use the workflow project's credentials and execution tools; they never inherit Eve's connections or sandbox.

The approval-gated trigger action submits bounded JSON callback data to `/api/runs/<runKey>/trigger` without exposing its hook token. It uses the continue-run approval closing line. A permanent event subscription instead uses the signed intake route and committed event registry described in [event sources](../skills/gtm-workflow/references/events.md). Source enable/disable uses the existing accepted workspace save, not a new agent-owned control store.

Start repeats the dry run, refuses when its rows or projected cost differ from the values the approver accepted, then polls the protected `GET /api/deployment` route until it returns the requested workspace SHA. It reads the bounded ignored input and calls the production route with:

- the host-only `GTM_WORKFLOW_RUN_SECRET` bearer;
- a short-lived `x-vercel-trusted-oidc-idp-token` from the Eve production deployment; and
- `x-gtm-workspace-head` carrying the same SHA.

The production POST route rejects a missing header with `409 deployment_head_required` and a mismatch with `409 deployment_not_ready`, closing the race between readiness polling and start. A timeout starts nothing.

Status returns the public run key and sanitized business state, including `completed`, `stopped`, `timed_out`, `cancelling`, `failed`, or `cancelled`, plus stop reason, remaining keys, failed step, and cost sources. Approval fetches the pending run and submits one typed decision; the token only names that pending stage. Cancel posts to the bearer-protected route, polls through `cancelling` to `cancelled`, and treats `409 run_not_active` as already finished.

The deployment watch waits at most ten minutes for the saved version. Post `Saved. I'll follow up here when it's live.` after confirmed save, then `Live.` when that version and its accepted tables are ready. On timeout before any start, post `Not live after 10 minutes. Nothing ran. I'll look into it.` and return investigation to the sandbox. The no-Vercel-token boundary remains; report what can be reproduced there. Watches deduplicate posts, survive a foreground return, and stop at terminal state. Run watches post at each new checkpoint and on completion, failure, stop, timeout, or cancellation. Never ask the user to poll.

After `Live.`, automatically propose a separate one-row real smoke run, with total cost, every model/provider call, and external effects. Use the existing start action with checkpoint 1; a scheduled workflow may use a manual POST for this smoke run. Scheduled GET delivery still has no checkpoint. Batch parents require a one-row input without a checkpoint. Free checks need no approval. Paid calls get one approval covering the complete smoke plan; the save approval never authorizes this spend.

## Conversation contract for hosted surfaces

The skills read the environment's standing instructions to decide how approval works. A hosted surface with a native approval control must satisfy all of the following, so that the vendored skill files work unchanged.

1. The host declares to the skills that it provides a native approval control and that this control is the accept step. Host instructions must not require a numbered accept before the write tool.
2. The approval message renders human text only, using `summary` with Approve and Cancel controls in one Slack message. Empty or whitespace-only text is invalid. Never render JSON, file content, manifests, or raw tool input in blocks or fallback text. `summary` may be up to 2,500 characters and must name every artifact and effect; larger proposals split only at the skill's artifact boundaries. For several gated calls in one task, ask once for the whole plan with total cost and every call/effect. Bind acceptance to exact scope and reuse it for later covered calls; reject changed scope for a fresh approval. Read-only work never prompts.
3. The host declares the per-message approval-text limit of 2,500 characters. If a plan requires parts, render every human-text part together under one accept/cancel decision and bind that approval to all listed calls and the total cost. Approval text is plain text: newlines and `- ` bullet lines allowed, no Markdown emphasis, headings, fences, tables, or arrows.
4. The host verifies deterministically, before requesting human approval, that `summary` ends with the closing line required for the action, and denies with an actionable one-sentence reason otherwise. The required lines are: save `Approve to save, or Cancel and tell me what to change.`; run start `Approve to run, or Cancel and tell me what to change.`; checkpoint continue `Approve to continue the run, or Cancel to leave it paused and tell me what to do.`; stop a paused run `Approve to stop the run here, or Cancel to leave it paused.`; cancel a live run `Approve to stop the run, or Cancel to leave it running.` The host never appends or alters the summary text, and `summary` is the entire approval surface: the skill writes no proposal message before the tool call because text written in the same turn as a tool call is not delivered.
5. The sentence about hosted deployment reads `Saving this also puts it live in production.`
6. Use exact plain-language outcome strings everywhere: `Saved.`, `Couldn't save. Nothing changed.`, `Saved, but I can't confirm it landed. Don't retry yet; I'll check.`, `Live.`, and `Not live yet.` The no-change string is valid only when no effects occurred. Unknown or partial saves use the unknown-outcome string, state confirmed effects in business words, and reconcile before retrying. A confirmed hosted save closes `Saved. I'll follow up here when it's live.` with the required background follow-up above. Precise diagnostics stay in tool results and logs.
7. Denial writes nothing and asks `**What would you like me to change?**`. Ordinary messages target 280 characters and never exceed about 500. Proposals and approval text are exempt from that target and ordinary ceiling because they must name every artifact/effect; keep them as short as possible within the host limit. Run and checkpoint reports have one headline and at most two numbers. Give cache hits, estimate-versus-actual, and cost-source breakdown only on request.
8. Apply the shared standard's banned vocabulary on ordinary surfaces: git, commit, push, PR, branch, SHA, hash, ledger, checkout, migration, repository, path, tool name, host name. Host names appear only inside the permitted Diagram/Runs/Data links. Host response budgets must support these rules.
9. First draft ready: post its picture plus `Data:` and `Runs:` links derived from configuration before the save proposal, without waiting for deployment. Each draft revision posts a new picture with a one-line change caption. On `Live.`, post the `Diagram:` link. Run links retain their start/checkpoint/completion moments. The draft picture and links precede the approval card in a separate message because the message carrying the approval tool call has no text.
10. "Thread" means the same original Slack conversation thread. Slack replies have one level: persist and reuse the originating thread timestamp for pictures, revisions, approvals, and all watch follow-ups. Never create a new thread from a reply timestamp.

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
