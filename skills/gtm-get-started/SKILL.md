---
name: gtm-get-started
description: Triggers when someone new to GTM Skills asks where to begin, with phrasings like "how do I get started", "what do I do first", "where do I begin with gtm", or /gtm-get-started. Looks at what the workspace already has and names the one next gtm skill to use, then stops; writes nothing. Not for requests that already name a job (a workspace, ICP, persona, fit check, workflow, or the Slack agent), which go straight to that gtm skill.
metadata:
  version: "0.2.4"
---

# GTM Get Started

## Trigger

Apply this skill when a request asks where to start or what to do next with GTM Skills and names no job.

## Scope

A router only: it reads the workspace, names one next step, and stops. It never does another gtm skill's job and never writes a file.

## Inputs

The request; the workspace found by the discovery order in [the contract](../gtm-workspace/references/contract.md); its `icps/*/ICP.md` and `personas/*/PERSONA.md`.

## Roles

The user picks the goal when the foundations are done; the agent reads and routes.

## Procedure

The first gtm skill used in a conversation checks once for a newer release, as [updates](../gtm-workspace/references/updates.md) says. Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md).

1. Take the first row whose check holds and give its step:

| Check | Next step |
| --- | --- |
| No workspace found | `/gtm-workspace`: set up the organization's workspace |
| No ICP | `/gtm-icp`: describe the companies to sell to |
| No persona | `/gtm-persona`: describe the people to sell to |
| All three exist | Ask **What next?** with **Check a company or person now (Recommended)** → `/gtm-qualify-prospects`, **Check them on a schedule** → `/gtm-workflow`, **Use it in Slack** → `/gtm-agent` |

2. Reply in at most two sentences: what is already in place, then the one step, with a phrase to say or the slash command. Stop.

## Outputs

One reply naming one next step; no files.

## Exceptions

Requires the `gtm-workspace` skill installed alongside this one; when `../gtm-workspace/SKILL.md` is missing, give its install command, `npx skills add eliasstravik/gtm-skills -g -y`, as the one step. Several workspaces match and none is named: ask which, as the contract says. On the hosted Slack agent (`GTM_AGENT_HOSTED` is `1`), drop the Slack option. A workspace that looks broken (no `ORG.md`, unreadable files): the step is "check the workspace" (`/gtm-workspace`).

## QC

- Exactly one next step, or one question whose every choice names one skill.
- No file changed; no other skill's job started.

## References

[interactions](references/interactions.md); from gtm-workspace: [contract](../gtm-workspace/references/contract.md), [interaction](../gtm-workspace/references/interaction.md), [updates](../gtm-workspace/references/updates.md).
