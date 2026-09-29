---
name: gtm-agent
description: Triggers when a user asks about, deploys, sets up, gets running, connects, checks, repairs, or upgrades GTM Agent (the Slack GTM agent that runs these skills on Vercel) for an organization, including questions before any setup about whether they could set it up, what it needs, or what it costs, with phrasings like "can I set up the Slack GTM agent", "what would I need for the Slack agent? don't deploy anything", "get gtm-agent running for Acme", "deploy the GTM agent to our Slack", "check the Acme deployment", or "upgrade our GTM agent". Load this skill for those questions instead of reading its files. Owns the agent's Vercel project, its Slack connector, and its access to the workspace repository. Not for the workspace, ICPs, personas, fit checks, or the workflows themselves, nor for taking the workflow project live or connecting it (gtm-workflow), which belong to gtm-workspace, gtm-icp, gtm-persona, gtm-qualify-prospects, and gtm-workflow.
metadata:
  version: "0.2.3"
---

# GTM Agent

## Trigger

Apply this skill when a request concerns getting GTM Agent deployed, connected, checked, or upgraded for an organization, or asks whether that is possible and what it needs, before anything is created.

## Scope

One deployment is: a private copy of the agent template `eliasstravik/gtm-agent` as the repository `gtm-agent-<slug>`, deployed as the Vercel project `gtm-agent-<slug>`; a Slack connector `slack/gtm-agent-<slug>` installed in the organization's Slack; the workspace repository `gtm-<slug>`; and, when workflows are enabled, the workflow project `gtm-<slug>` that gtm-workflow's shared setup `--deploy` takes live (project, Neon, share project, secrets, the first push of `workflows/`) and wires to this agent, which agent setup runs as its last step. The scripts in `scripts/` use the GitHub and Vercel CLIs; `references/setup.md` lists what setup creates. Connection names come from the Vercel Secret Note or local label, following [Connections naming](../gtm-workflow/references/connections.md#inventory-and-changes). The agent remains optional for that setup. The workspace's contents belong to the other gtm skills.

## Inputs

The request; the organization's workspace slug (the contract's slug rule; from an existing `~/.gtm/<slug>/` when one exists); the Vercel team slug (`vercel teams ls`; ask when more than one); the GitHub owner (the signed-in user unless the request names an organization); optionally a Slack channel id (`C0…`, at the bottom of a channel's About tab) for workflow notifications; `references/setup.md`.

## Roles

The user has the GitHub and Vercel CLIs signed in on this computer, authorizes the Slack install when required, either directly or through their authorized browser agent, adds the Neon database to the workflow project through Vercel's Neon integration (Production only, preview branching off) and accepts Neon's marketplace terms the first time a team uses it, invites the bot to a channel, and says the first sentence in Slack; the agent runs the scripts, relays exactly what the user must do, and reports the outcome.

## Procedure

The first gtm skill used in a conversation checks once for a newer release, as [updates](../gtm-workspace/references/updates.md) says. Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md). Before any job, confirm this computer can do it: `gh auth status` and `vercel whoami` both succeed, and `node --version` is 22 or newer. When they do not, or when this is the hosted agent itself (no `vercel` on PATH, or `GTM_AGENT_HOSTED` is `1`), run nothing: say what is missing in one sentence and that a teammate runs `/gtm-agent` on a computer with both CLIs signed in.

| Job | Do |
| --- | --- |
| Readiness | The user only asks whether they could set it up, what it needs, or what it costs. Create nothing. Run the read-only checks above and `vercel teams ls`, then say what is ready, what is missing, what setup will create, the human steps it will ask for (from `references/setup.md`), and that the Vercel team must be Pro. Offer Deploy. |
| Deploy | Ask for the Vercel team only when `vercel teams ls` shows more than one; ask for a channel id only when the user mentions workflow notifications. Say the one sentence of what will happen and that it takes about five minutes. Run `node scripts/setup.mjs --slug <slug> --team <team> [--github-owner <owner>] [--channel <id>]` from this skill's folder, streaming its output. When it prints the Slack address, relay it with the three things to do on that page (choose the workspace, configure the selected Slack profile using [Slack configuration](references/slack.md), Allow) and wait; the script continues by itself. Exit 2 names one human step (the fine-grained GitHub token, the Slack installation, Vercel's GitHub app access to a new repository, or Neon's terms the first time the team adds Neon): relay it, wait, run the same command again. Exit 0: close with the two Slack lines the script printed. Exit 1: report the failing line in plain words and offer Doctor. |
| Doctor | `node scripts/doctor.mjs --slug <slug> --team <team> [--github-owner <owner>] [--agent-project <name>] [--workflow-project <name>] [--slack-connector <uid>]`; report the failing lines in business terms with their fixes; every workflow-project fix is gtm-workflow's setup `--deploy` with `--agent-project`, which repairs whatever is missing; `--fix` turns off the agent project's preview deployments. For Slack changes, run `configure-slack.mjs --team <team> --connector <uid> --apply`, then follow [Slack configuration](references/slack.md) to synchronize the provider manifest and reinstall. Pass a fresh `--slack-manifest <file.json>` to Doctor; it checks provider settings, installation freshness, and live token grants. |
| Upgrade | In the agent checkout (`~/.gtm/.agents/<slug>/`, or the repository the user names): `git fetch template && git merge template/main`, preserve downstream customizations when merging, resolving routine conflicts within the authorized upgrade; ask only when intended behavior is ambiguous, `git push`; the push deploys. Then Doctor. When the workflow runtime is behind, say so and hand off to gtm-workflow's Upgrade. Doctor's "Agent runs the latest GTM Skills release" line says when an Upgrade is due; the hosted agent says so in Slack too ([updates](../gtm-workspace/references/updates.md)). |

Names are fixed by the slug: `gtm-<slug>` (workspace repository), `gtm-agent-<slug>` (agent repository and project), `gtm-<slug>` (workflow project, named like the repository), `gtm-<slug>-share` (public share and webhook relay project), `slack/gtm-agent-<slug>` (connector), the Neon database `gtm-<slug>`, connected to the workflow project only. A deployment made by hand before this skill keeps its names; pass them as overrides.

## Outputs

A live agent answering in Slack, wired to its workspace repository and, unless declined, a live workflow project; the doctor's report; the two Slack lines: invite the app, then `@gtm-agent-<slug> set up our GTM workspace`.

## Exceptions

Secrets never pass through the conversation: the scripts generate them and place them with `vercel env add`; the agent host adds `GTM_GITHUB_TOKEN` only to git requests for the workspace repository, and the token is a fine-grained one limited to that repository (Contents read and write): setup never uses the CLI's own login, stops with exit 2 and says how to make one, and takes it from `GTM_GITHUB_TOKEN` in the user's own terminal when run again, refusing any token that is not fine-grained (`github_pat_…`). A Vercel Hobby account cannot hold a team: say that a Pro team is needed and stop. A GitHub organization that has not installed the Vercel GitHub app makes `vercel git connect` fail: name the install (Vercel → Settings → Git) and run again. A Vercel configuration update can leave Slack unchanged. Follow [Slack configuration](references/slack.md); Doctor must verify both sides and the installed token before reporting success. Requires `gtm-workspace` and `gtm-workflow` installed alongside this skill; when either is missing, say to install it with `npx skills add eliasstravik/gtm-skills -s <name> -y` (add `-g` when this skill lives in the global skills directory), then retry.

## Protected workflow viewer

The workflow project sits behind Vercel Authentication on every deployment. The agent reaches it with the project's one automation bypass (the one the app sees as `VERCEL_AUTOMATION_BYPASS_SECRET`), which gtm-workflow's setup stores on the agent as `GTM_WORKFLOW_BYPASS_SECRET`; the bypass never enters model-visible exports or user links. The workflow project keeps exactly one bypass (Doctor flags extras), so the agent's copy is the one the agent-only routes accept; to replace it, delete `GTM_WORKFLOW_BYPASS_SECRET` on the agent and run that setup again. Webhook senders post to the share project's relay (`https://gtm-<slug>-share.vercel.app/api/intake/<workflow>`), which forwards signed events with its OIDC identity; never give a sender a bypass. See [workflow viewer](../gtm-workflow/references/viewer.md).

## QC

- Connections lives in the existing private workflow project. Verify its signed-in browser access after deployment; configuration alone is not readiness. Native account login, provider consent and Slack-specific actions may require the human.
- No secret value appeared in the conversation or a reply.
- Doctor ends with "All good." before the deployment is called done; every failing line was reported with its fix. Live smoke checks cover mentions, private channels, DMs, group-DM mentions, workflow replies, file downloads/uploads, and approvals; use an authorized test conversation.
- The closing reply carries the two Slack lines and nothing about commits, builds, or checks.

## References

[setup.md](references/setup.md) for what the scripts create, every variable, and the by-hand equivalent; [interactions](references/interactions.md) dialogues; from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md); from gtm-workflow: [deploy.md](../gtm-workflow/references/deploy.md).
