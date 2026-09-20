# Setup: what the scripts do

`scripts/setup.mjs --slug <slug> --team <team>` runs these steps in order, each one skipped when its result already exists. `scripts/doctor.mjs` checks the same list read-only and, with `--fix`, repairs project settings and removes obsolete variables.

## Steps

1. Preflight: Node 22+, `gh` and `vercel` signed in, the team exists, `gtm-workflow/templates` installed next to this skill.
2. Workspace repository `gtm-<slug>`, private, empty. The agent's first approved save scaffolds it; nothing is written here except the workflow runtime (step 9).
3. Agent repository `gtm-agent-<slug>`, a private clone of `eliasstravik/gtm-agent` with remote `origin` (the copy) and `template` (the source, for Upgrade). Checkout at `~/.gtm/.agents/<slug>/`.
4. Vercel project `gtm-agent-<slug>`, framework `eve`, Node 24, preview deployments off (they would fail without the production-only variables), git-connected to the agent repository, so every push to `main` deploys.
5. Agent variables: `GTM_WORKSPACE_REPOSITORY` (`<owner>/gtm-<slug>`), `GTM_GITHUB_TOKEN` (`gh auth token`; commits are authored as that user), optional `GTM_NOTIFY_CHANNEL` and `GTM_AGENT_MODEL`.
6. Slack connector `slack/gtm-agent-<slug>` through `vercel connect create slack`: one browser trip creates the Slack app and installs it; the full bot profile is configured by `configure-slack.mjs` and synchronized with Slack as described in [Slack configuration](slack.md). Events forwarded to `/eve/v1/slack` on the agent project; `SLACK_CONNECTOR` set to the connector's uid.
7. First agent deployment from git; the production address is read back.
8. Unless `--no-workflows`, delegate to `gtm-workflow/scripts/setup.mjs --deploy` for the existing protected workflow project. The shared implementation prepares the local runtime and configures Connections on that project. It creates no additional hosted resources and reports when deployment or token setup is still needed. Standalone users call it directly without an agent.
9. Preserve existing machine and notification credentials and project bindings. Workflow hosting and the agent's machine transport must already be configured; Connections setup does not provision or rotate them. Repeated setup keeps the active agent source.
10. If requested, create a project-scoped token in Vercel and save it directly as the workflow project's Production Secret. Deploy the runtime, then verify Connections in the normal signed-in private Workflows browser session. See [Connections](../../gtm-workflow/references/connections.md).
11. Doctor, then the two Slack lines.

## Variables

| Variable | Agent project | Workflow project | Set by |
| --- | :---: | :---: | --- |
| `SLACK_CONNECTOR` | yes | | step 6 |
| `GTM_WORKSPACE_REPOSITORY` | yes | | step 5 |
| `GTM_GITHUB_TOKEN` | yes | | step 5 |
| `GTM_NOTIFY_CHANNEL` | optional | | `--channel` |
| `GTM_AGENT_MODEL`, `GTM_AGENT_REASONING` | optional | | `--model`, by hand |
| `GTM_WORKFLOW_URL` | yes | | existing workflow binding |
| `GTM_RUN_SECRET` | yes | yes | existing machine transport |
| `CRON_SECRET` | | yes | existing workflow hosting |
| `GTM_NOTIFY_SECRET` | yes | yes | existing notification transport |
| `GTM_MODEL`, `GTM_REASONING` | | yes, optional | by hand |
| `GTM_AGENT_URL` | | yes | existing notification binding |
| `GTM_WORKFLOW_BYPASS_SECRET`, `GTM_WORKFLOW_GATE_REQUIRED` | yes | | staged gate access; host-only injection |
| `GTM_VIEWER_PROTECTED`, `GTM_VIEWER_SHARE_ORIGIN` | | yes | set only after native protection and companion verification |
| `GTM_DATA_URL` | | optional | by hand, only to name the database's page |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | never | yes | the Neon integration in Vercel, Production only; never by hand, and never on the share project |
| `GTM_CONNECTIONS_VERCEL_TOKEN` | | yes | project-scoped token, saved as a Production Secret |
| `GTM_CONNECTIONS_ENABLED`, `GTM_CONNECTIONS_ORIGIN`, `GTM_CONNECTIONS_TEAM_ID` | | yes | Connections setup |
| Provider keys (`MONID_API_KEY`, …) | never | as needed | protected Production Connections form |
| `AI_GATEWAY_API_KEY` | never | never | the deployed copies use the project's OIDC identity |

## What stays human

- `vercel login` and `gh auth login`, once per computer; a Vercel Pro team (Hobby accounts cannot hold teams).
- The Vercel GitHub app installed for the GitHub owner (done when the Vercel account was created with GitHub; otherwise Vercel → Settings → Git).
- The Slack browser trip in step 6: choose the workspace and approve. For configuration and later changes, follow [Slack configuration](slack.md), which covers Vercel, the Slack App Manifest, reinstall, and live verification.
- Project-scoped token setup if the CLI cannot create it, and signed-in browser verification described in [Connections](../../gtm-workflow/references/connections.md).
- Inviting the app to the channel and the first sentence.

## Standalone hosting

Use the shared [workflow setup](../../gtm-workflow/references/connections.md) when no agent or Slack connection is needed.

The share-only companion is sourced from the same repository and workflows root with `npm run build:share`. It holds only its private origin/project identity and uses production-to-production OIDC trust. See [viewer deployment](../../gtm-workflow/references/viewer.md).
