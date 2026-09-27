# Setup: what the scripts do

`scripts/setup.mjs --slug <slug> --team <team>` runs these steps in order, each one skipped when its result already exists, so running it again after a fix carries on. `scripts/doctor.mjs` checks the same list read-only; every failing line names its fix.

## Steps

1. Preflight: Node 22+, `gh` and `vercel` signed in, the team exists, `gtm-workflow` installed next to this skill.
2. Workspace repository `gtm-<slug>`, private.
3. Agent repository `gtm-agent-<slug>`, a private clone of `eliasstravik/gtm-agent` with remote `origin` (the copy) and `template` (the source, for Upgrade). Checkout at `~/.gtm/.agents/<slug>/`.
4. Vercel project `gtm-agent-<slug>`, framework `eve`, Node 24, preview deployments off (they would fail without the production-only variables), git-connected to the agent repository, so every push to `main` deploys.
5. Agent variables: `GTM_WORKSPACE_REPOSITORY` (`<owner>/gtm-<slug>`), `GTM_GITHUB_TOKEN` (`gh auth token`; commits are authored as that user; replace it with a fine-grained token limited to the workspace repository, Contents read and write, and Redeploy; the host adds it only to git requests for that repository), optional `GTM_NOTIFY_CHANNEL` and `GTM_AGENT_MODEL`.
6. Slack connector `slack/gtm-agent-<slug>` through `vercel connect create slack`: one browser trip creates the Slack app and installs it; the full bot profile is configured by `configure-slack.mjs` and synchronized with Slack as described in [Slack configuration](slack.md). Events forwarded to `/eve/v1/slack` on the agent project; `SLACK_CONNECTOR` set to the connector's uid.
7. First agent deployment from git; the production address is read back.
8. Unless `--no-workflows`: clone (or fast-forward) the workspace to `~/.gtm/<slug>`, then run gtm-workflow's shared `scripts/setup.mjs --deploy --agent-project gtm-agent-<slug>`. It takes the workspace live the way a person would with Vercel's own tools (project `gtm-<slug>` git-connected with root `workflows/`, `vercel link`, Neon from the marketplace for Production only, the secrets, one automation bypass, the share project `gtm-<slug>-share`, the first push of `workflows/`, a production deployment) and wires the agent: `GTM_WORKFLOW_URL`, `GTM_WORKFLOW_BYPASS_SECRET`, `GTM_WORKFLOW_GATE_REQUIRED` on the agent, `GTM_AGENT_URL` on the workflow project, and one `GTM_NOTIFY_SECRET` on both; it redeploys whichever project changed. See [Deploy](../../gtm-workflow/references/deploy.md). Exit 2 there (Neon's terms, the first time a team adds Neon) stops agent setup with the same exit code.
9. Doctor, then the two Slack lines.

## Variables

| Variable | Agent project | Workflow project | Set by |
| --- | :---: | :---: | --- |
| `SLACK_CONNECTOR` | yes | | step 6 |
| `GTM_WORKSPACE_REPOSITORY` | yes | | step 5 |
| `GTM_GITHUB_TOKEN` | yes | | step 5 |
| `GTM_NOTIFY_CHANNEL` | optional | | `--channel` |
| `GTM_AGENT_MODEL`, `GTM_AGENT_REASONING` | optional | | `--model`, by hand |
| `GTM_WORKFLOW_URL` | yes | | workflow setup: the workflow project's production address |
| `CRON_SECRET` | | yes | workflow setup, a random value of its own (Vercel Cron sends it) |
| `GTM_NOTIFY_SECRET` | yes | yes | workflow setup, one random value on both |
| `GTM_MODEL`, `GTM_REASONING` | | yes, optional | by hand |
| `GTM_AGENT_URL` | | yes | workflow setup: the agent's production address |
| `GTM_WORKFLOW_BYPASS_SECRET`, `GTM_WORKFLOW_GATE_REQUIRED` | yes | | workflow setup: the workflow project's one automation bypass; host-only injection |
| `GTM_VIEWER_PROTECTED`, `GTM_VIEWER_SHARE_ORIGIN`, `GTM_VIEWER_LINK_KEY` | | yes | workflow setup |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | never | yes | the Neon integration in Vercel, Production only; never by hand, and never on the share project |
| `GTM_CONNECTIONS_VERCEL_TOKEN` | | yes | workflow setup: a project-scoped token, saved as a Production Secret |
| `GTM_CONNECTIONS_ENABLED`, `GTM_CONNECTIONS_ORIGIN`, `GTM_CONNECTIONS_TEAM_ID`, `GTM_CONNECTIONS_VERCEL_URL` | | yes | workflow setup |
| Provider keys (`MONID_API_KEY`, …) | never | as needed | protected Production Connections form |
| `AI_GATEWAY_API_KEY` | never | never | the deployed copies use the project's OIDC identity |

## What stays human

- `vercel login` and `gh auth login`, once per computer; a Vercel Pro team (Hobby accounts cannot hold teams).
- The Vercel GitHub app installed for the GitHub owner (done when the Vercel account was created with GitHub; otherwise Vercel → Settings → Git).
- The Slack browser trip in step 6: choose the workspace and approve. For configuration and later changes, follow [Slack configuration](slack.md), which covers Vercel, the Slack App Manifest, reinstall, and live verification.
- Neon's marketplace terms, the first time a team adds Neon (`vercel integration add neon -e production` in `workflows/`, then setup again).
- A project-scoped token made on vercel.com if the CLI cannot create it, as setup says when that happens.
- Inviting the app to the channel and the first sentence.

## Standalone hosting

Without an agent, run gtm-workflow's shared setup `--deploy` directly; see [Deploy](../../gtm-workflow/references/deploy.md). To connect an agent later, run it again with `--agent-project gtm-agent-<slug>`.
