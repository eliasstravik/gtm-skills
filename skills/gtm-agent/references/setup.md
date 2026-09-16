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
8. Unless `--no-workflows`, delegate to `gtm-workflow/scripts/setup.mjs --deploy` with the bound workflow and agent projects. The shared implementation scaffolds an empty runtime, provisions workflow/database/viewer/Connections resources, and deploys pinned source. Standalone users call it directly without an agent.
9. Preserve existing machine and notification credentials. A partially configured pair requires explicit reconciliation; setup never silently rotates either side. Repeated setup keeps the active agent source.
10. Complete the two owner-controlled registrations and selected-project consent through the trusted local setup page. Resume verifies identity, exact scopes, project bindings, deployed code and the signed-in owner. See [Connections](../../gtm-workflow/references/connections.md).
11. Doctor, then the two Slack lines.

## Variables

| Variable | Agent project | Workflow project | Set by |
| --- | :---: | :---: | --- |
| `SLACK_CONNECTOR` | yes | | step 6 |
| `GTM_WORKSPACE_REPOSITORY` | yes | | step 5 |
| `GTM_GITHUB_TOKEN` | yes | | step 5 |
| `GTM_NOTIFY_CHANNEL` | optional | | `--channel` |
| `GTM_AGENT_MODEL`, `GTM_AGENT_REASONING` | optional | | `--model`, by hand |
| `GTM_WORKFLOW_URL` | yes | | shared setup |
| `GTM_RUN_SECRET` | yes | yes | shared setup |
| `CRON_SECRET` | | yes | shared setup |
| `GTM_NOTIFY_SECRET` | yes | yes | shared setup |
| `GTM_MODEL`, `GTM_REASONING` | | yes, optional | shared setup, by hand |
| `GTM_AGENT_URL` | | yes | shared setup |
| `GTM_WORKFLOW_BYPASS_SECRET`, `GTM_WORKFLOW_GATE_REQUIRED` | yes | | staged gate access; host-only injection |
| `GTM_VIEWER_PROTECTED`, `GTM_VIEWER_SHARE_ORIGIN` | | yes | set only after native protection and companion verification |
| `GTM_DATA_URL` | | optional | by hand, only to override the Turso page the runtime derives |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | | yes | shared setup |
| Provider keys (`MONID_API_KEY`, …) | never | as needed | protected Production Connections form |
| `AI_GATEWAY_API_KEY` | never | never | the deployed copies use the project's OIDC identity |

## What stays human

- `vercel login` and `gh auth login`, once per computer; a Vercel Pro team (Hobby accounts cannot hold teams).
- The Vercel GitHub app installed for the GitHub owner (done when the Vercel account was created with GitHub; otherwise Vercel → Settings → Git).
- The Slack browser trip in step 6: choose the workspace and approve. For configuration and later changes, follow [Slack configuration](slack.md), which covers Vercel, the Slack App Manifest, reinstall, and live verification.
- `vercel integration accept-terms tursocloud`, the first time a team installs Turso.
- The owner-controlled identity and integration registrations, selected-project consent, and sign-in verification described in [Connections](../../gtm-workflow/references/connections.md).
- Inviting the app to the channel and the first sentence.

## Standalone hosting

Use the shared [workflow setup](../../gtm-workflow/references/connections.md) when no agent or Slack connection is needed.

The share-only companion is sourced from the same repository and workflows root with `npm run build:share`. It holds only its private origin/project identity and uses production-to-production OIDC trust. See [viewer deployment](../../gtm-workflow/references/viewer.md).
