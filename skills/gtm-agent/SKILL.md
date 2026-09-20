---
name: gtm-agent
description: Triggers when a user asks to deploy, set up, get running, connect, check, repair, or upgrade GTM Agent (the Slack agent that runs these skills on Vercel) for an organization, with phrasings like "get gtm-agent running for Acme", "deploy the GTM agent to our Slack", "connect the workflow project for Acme", "check the Acme deployment", or "upgrade our GTM agent". Owns the agent's Vercel project, its Slack connector, the workflow project, and the wiring between them and the workspace repository. Not for the workspace, ICPs, personas, fit checks, or the workflows themselves, which belong to gtm-workspace, gtm-icp, gtm-persona, gtm-qualify-prospects, and gtm-workflow.
---

# GTM Agent

## Trigger

Apply this skill when a request concerns getting GTM Agent deployed, connected, checked, or upgraded for an organization.

## Scope

One deployment is: a private copy of the agent template `eliasstravik/gtm-agent` as the repository `gtm-agent-<slug>`, deployed as the Vercel project `gtm-agent-<slug>`; a Slack connector `slack/gtm-agent-<slug>` installed in the organization's Slack; the workspace repository `gtm-<slug>` (empty until the agent's first save, save for the workflow runtime); and, when workflows are enabled, an existing Vercel project `gtm-<slug>-workflows` connected to that repository's `workflows/` folder with its existing database and machine transport. The scripts in `scripts/` use the GitHub and Vercel CLIs; `references/setup.md` lists what setup creates and what must already exist. Connections setup uses the existing protected workflow project through [shared setup](../gtm-workflow/references/connections.md). Connection names come from the Vercel Secret Note or local label, following [Connections naming](../gtm-workflow/references/connections.md#inventory-and-changes). The agent remains optional for that setup. The workspace's contents belong to the other gtm skills.

## Inputs

The request; the organization's workspace slug (the contract's slug rule; from an existing `~/.gtm/<slug>/` when one exists); the Vercel team slug (`vercel teams ls`; ask when more than one); the GitHub owner (the signed-in user unless the request names an organization); optionally a Slack channel id (`C0…`, at the bottom of a channel's About tab) for workflow notifications; `references/setup.md`.

## Roles

The user has the GitHub and Vercel CLIs signed in on this computer, authorizes the Slack install when required, either directly or through their authorized browser agent, adds the Neon database to the workflow project through Vercel's Neon integration (Production only, preview branching off) and accepts Neon's marketplace terms the first time a team uses it, invites the bot to a channel, and says the first sentence in Slack; the agent runs the scripts, relays exactly what the user must do, and reports the outcome.

## Procedure

Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md). Before any job, confirm this computer can do it: `gh auth status` and `vercel whoami` both succeed, and `node --version` is 22 or newer. When they do not, or when this is the hosted agent itself (no `vercel` on PATH, or `GTM_RUN_SECRET` reads `host`), run nothing: say what is missing in one sentence and that a teammate runs `/gtm-agent` on a computer with both CLIs signed in.

| Job | Do |
| --- | --- |
| Deploy | Ask for the Vercel team only when `vercel teams ls` shows more than one; ask for a channel id only when the user mentions workflow notifications. Say the one sentence of what will happen and that it takes about five minutes. Run `node scripts/setup.mjs --slug <slug> --team <team> [--github-owner <owner>] [--channel <id>]` from this skill's folder, streaming its output. When it prints the Slack address, relay it with the three things to do on that page (choose the workspace, configure the selected Slack profile using [Slack configuration](references/slack.md), Allow) and wait; the script continues by itself. Exit 2 names one human step: Slack installation, marketplace terms, project-scoped token setup, or signed-in setup verification: relay it, wait, run the same command again. Exit 0: close with the two Slack lines the script printed. Exit 1: report the failing line in plain words and offer Doctor. |
| Connect | The workflow project alone, for a deployment made before this skill or with `--no-workflows`: the same command with `--agent-project <name>` when the agent project has another name; the script skips what exists. |
| Doctor | `node scripts/doctor.mjs --slug <slug> --team <team> [--github-owner <owner>] [--agent-project <name>] [--workflow-project <name>] [--slack-connector <uid>]`; report the failing lines in business terms with their fixes; run again with `--fix` when the user accepts the safe fixes (project settings, obsolete variables). For Slack changes, run `configure-slack.mjs --team <team> --connector <uid> --apply`, then follow [Slack configuration](references/slack.md) to synchronize the provider manifest and reinstall. Pass a fresh `--slack-manifest <file.json>` to Doctor; it checks provider settings, installation freshness, and live token grants. |
| Upgrade | In the agent checkout (`~/.gtm/.agents/<slug>/`, or the repository the user names): `git fetch template && git merge template/main`, preserve downstream customizations when merging, resolving routine conflicts within the authorized upgrade; ask only when intended behavior is ambiguous, `git push`; the push deploys. Then Doctor. When the workflow runtime is behind, say so and hand off to gtm-workflow's Upgrade. |

Names are fixed by the slug: `gtm-<slug>` (workspace repository), `gtm-agent-<slug>` (agent repository and project), `gtm-<slug>-workflows` (workflow project), `slack/gtm-agent-<slug>` (connector), the Neon database `gtm-<slug>`, connected to the workflow project only. A deployment made by hand before this skill keeps its names; pass them as overrides.

## Outputs

A live agent answering in Slack, wired to its workspace repository and, unless declined, a live workflow project; the doctor's report; the two Slack lines: invite the app, then `@gtm-agent-<slug> set up our GTM workspace`.

## Exceptions

Secrets never pass through the conversation: the scripts generate them and place them with `vercel env add`; the GitHub token is the CLI's own (`gh auth token`), which reaches every repository that user can write, and the user may replace `GTM_GITHUB_TOKEN` with a fine-grained token later. A Vercel Hobby account cannot hold a team: say that a Pro team is needed and stop. A GitHub organization that has not installed the Vercel GitHub app makes `vercel git connect` fail: name the install (Vercel → Settings → Git) and run again. A Vercel configuration update can leave Slack unchanged. Follow [Slack configuration](references/slack.md); Doctor must verify both sides and the installed token before reporting success. Requires `gtm-workspace` and `gtm-workflow` installed alongside this skill; when either is missing, say to install it with `npx skills add eliasstravik/gtm-skills -s <name> -y` (add `-g` when this skill lives in the global skills directory), then retry.

## Protected workflow viewer

Setup stages an origin-scoped workflow bypass in the agent host, deploys that host, then enables native Vercel Authentication on All Deployments. The bypass and execution bearer never enter model-visible exports or user links. Doctor preserves protection and reports missing machine access or mismatched share-project trust. Existing signed intake senders need their own verified gate transport while preserving application signature checks; only pass `--intake-protection-verified` after checking each sender.

One public sharing project uses the workspace repository's `workflows/` root and `npm run build:share`. It has production-to-production Trusted Sources access to its own private project, only the fixed GET proxy, and no database, execution or provider credentials. Enable Share after deployment and access verification. See [workflow viewer](../gtm-workflow/references/viewer.md).

## QC

- Connections lives in the existing private workflow project. Verify its signed-in browser access after deployment; configuration alone is not readiness. Native account login, provider consent and Slack-specific actions may require the human.
- No secret value appeared in the conversation or a reply.
- Doctor ends with "All good." before the deployment is called done; every failing line was reported with its fix. Live smoke checks cover mentions, private channels, DMs, group-DM mentions, workflow replies, file downloads/uploads, and approvals; use an authorized test conversation.
- The closing reply carries the two Slack lines and nothing about commits, builds, or checks.

## References

[setup.md](references/setup.md) for what the scripts create, every variable, and the by-hand equivalent; [interactions](references/interactions.md) dialogues; from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md); from gtm-workflow: [deploy.md](../gtm-workflow/references/deploy.md).
