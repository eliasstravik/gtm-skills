# Setup: what the scripts do

`scripts/setup.mjs --slug <slug> --team <team>` runs these steps in order, each one skipped when its result already exists. `scripts/doctor.mjs` checks the same list read-only and, with `--fix`, repairs project settings and removes obsolete variables.

## Steps

1. Preflight: Node 22+, `gh` and `vercel` signed in, the team exists, `gtm-workflow/templates` installed next to this skill.
2. Workspace repository `gtm-<slug>`, private, empty. The agent's first approved save scaffolds it; nothing is written here except the workflow runtime (step 9).
3. Agent repository `gtm-agent-<slug>`, a private clone of `eliasstravik/gtm-agent` with remote `origin` (the copy) and `template` (the source, for Upgrade). Checkout at `~/.gtm/.agents/<slug>/`.
4. Vercel project `gtm-agent-<slug>`, framework `eve`, Node 24, preview deployments off (they would fail without the production-only variables), git-connected to the agent repository, so every push to `main` deploys.
5. Agent variables: `GTM_WORKSPACE_REPOSITORY` (`<owner>/gtm-<slug>`), `GTM_GITHUB_TOKEN` (`gh auth token`; commits are authored as that user), optional `GTM_NOTIFY_CHANNEL` and `GTM_AGENT_MODEL`.
6. Slack connector `slack/gtm-agent-<slug>` through `vercel connect create slack`: one browser trip creates the Slack app and installs it; the trigger events are set from the command line, the bot scopes on that page under Advanced. Events forwarded to `/eve/v1/slack` on the agent project; `SLACK_CONNECTOR` set to the connector's uid.
7. First agent deployment from git; the production address is read back.
8. Unless `--no-workflows`, the workflow runtime is copied from `gtm-workflow/templates` into `workflows/` of the workspace repository (`gitignore` renamed, `env.example` removed, `package-lock.json` generated) and pushed as "Add the workflow runtime", so the project below is live before the first workflow exists. gtm-workspace treats a clone holding only `workflows/` as empty.
9. Vercel project `gtm-<slug>-workflows`, git-connected to the workspace repository, root directory `workflows`, Node 22, framework `nitro`, system variables exposed, ignored build step `git diff --quiet HEAD^ HEAD -- .`, deployment protection off, preview deployments off. Linked from `~/.gtm/.links/gtm-<slug>-workflows/`, a second clone that only the Vercel CLI uses.
10. Turso database `gtm-<slug>` from the marketplace (`starter` plan, region `iad1` unless `--region`), connected to production: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
11. Workflow variables: `GTM_RUN_SECRET` and `CRON_SECRET` (one generated value), `GTM_NOTIFY_SECRET` (generated), `GTM_MODEL` (`openai/gpt-5.6-luna`), `GTM_AGENT_URL`, `GTM_RUNS_URL`. The same `GTM_RUN_SECRET` and `GTM_NOTIFY_SECRET` go on the agent project; when one side already has a value and the other does not, both are rotated.
12. Workflow deployment from git; `GTM_WORKFLOW_URL` set on the agent; the agent redeployed.
13. Doctor, then the two Slack lines.

## Variables

| Variable | Agent project | Workflow project | Set by |
| --- | :---: | :---: | --- |
| `SLACK_CONNECTOR` | yes | | step 6 |
| `GTM_WORKSPACE_REPOSITORY` | yes | | step 5 |
| `GTM_GITHUB_TOKEN` | yes | | step 5 |
| `GTM_NOTIFY_CHANNEL` | optional | | `--channel` |
| `GTM_AGENT_MODEL`, `GTM_AGENT_REASONING` | optional | | `--model`, by hand |
| `GTM_WORKFLOW_URL` | yes | | step 12 |
| `GTM_RUN_SECRET` | yes | yes | step 11 |
| `CRON_SECRET` | | yes | step 11 |
| `GTM_NOTIFY_SECRET` | yes | yes | step 11 |
| `GTM_MODEL`, `GTM_REASONING` | | yes, optional | step 11, by hand |
| `GTM_AGENT_URL` | | yes | step 11 |
| `GTM_RUNS_URL` | | yes | step 11; `doctor.mjs --fix` on older projects |
| `GTM_DATA_URL` | | optional | by hand, only to override the Turso page the runtime derives |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | | yes | step 10 |
| Provider keys (`MONID_API_KEY`, …) | never | as needed | by hand |
| `AI_GATEWAY_API_KEY` | never | never | the deployed copies use the project's OIDC identity |

## What stays human

- `vercel login` and `gh auth login`, once per computer; a Vercel Pro team (Hobby accounts cannot hold teams).
- The Vercel GitHub app installed for the GitHub owner (done when the Vercel account was created with GitHub; otherwise Vercel → Settings → Git).
- The Slack browser trip in step 6: choose the workspace, add under Advanced the trigger events `app_mention`, `message.channels`, `message.groups`, `message.im` and the bot scopes `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`, `im:history`, `files:read`, then Allow. Missing ones are added later on the connector's Advanced page in the Vercel Connect dashboard, with a reinstall when Slack asks.
- `vercel integration accept-terms tursocloud`, the first time a team installs Turso.
- Inviting the app to the channel and the first sentence.

## By hand

The same result without the scripts is the Deploy button in `eliasstravik/gtm-agent`'s getting-started page plus the dashboard steps in gtm-workflow's [deploy.md](../../gtm-workflow/references/deploy.md).
