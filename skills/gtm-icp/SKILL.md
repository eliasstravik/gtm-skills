---
name: gtm-icp
description: Triggers when a user asks to create, update, delete, or check an ideal customer profile, or ICP, in a GTM workspace, with phrasings like "create an ICP for lean B2B SaaS", "our ICP should require HubSpot", "delete the SaaS ICP", or "check the ICPs". Owns the ICP files and their 13 company criteria. Not for the workspace, its members, or the organization's own facts (gtm-workspace), personas (gtm-persona), checking a given company against an ICP (gtm-qualify-prospects), or workflows that score accounts on a schedule (gtm-workflow).
---

# GTM ICP

## Trigger

Apply this skill when a request creates, changes, removes, or checks an ICP in a GTM workspace.

## Scope

This skill owns `icps/<slug>/ICP.md` in the workspace found by [the contract](../gtm-workspace/references/contract.md). An ICP records desired or accepted criteria for target accounts in the 13 fields of [company data](../gtm-workspace/references/company-data.md), never facts about the organization itself.

## Inputs

Criteria from the user or sources the user supplies; the existing ICPs, for the near-duplicate check; the names of ICPs copied into `workflows/workflows/*.ts`, for the copy notice.

## Roles

The user approves every change through the host's write permission; the agent proposes, edits, commits, and reports.

## Procedure

Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md).

| Job | Do |
| --- | --- |
| Create | When an existing ICP overlaps the request, offer Update first. Otherwise copy `templates/ICP.md` to `icps/<slug>/ICP.md`, fill only the criteria the user gave, leave the rest `Unknown`, and say the rest stays Unknown because criteria are never borrowed from the company record. Omit `## Company signals` and `## Disqualifiers` when empty. |
| Update | Change the named criteria, signals, or disqualifiers. When a workflow file names this ICP, say that workflow keeps its own copy of the criteria until it is updated. |
| Delete | When several ICPs match, ask which; say whether a workflow carries a copy, which keeps running. Remove `icps/<slug>/`; close with what disappeared and that it stays in the workspace's history. |
| Doctor | Flag an ICP with no account-matchable criterion (every field `Unknown`), a placeholder husk, a missing H1, or a folder name that is not its slug; offer the fixes as options; rewrite what the user accepts. `Unknown` in Description and Domain is normal. |

Every save: one sentence on what will change, pull first when `origin/main` exists, edit through the host's write path, commit on `main` with a plain-language message, push when a remote exists, verify the commit (and that it reached `origin/main` when a remote exists), close with `Saved.`.

## Outputs

`icps/<slug>/ICP.md` in the template's shape, each change a commit on `main`.

## Exceptions

Requires the `gtm-workspace` skill installed alongside this one; when `../gtm-workspace/SKILL.md` is missing, say: install it the same way this skill was installed, with `npx skills add eliasstravik/gtm-skills -s gtm-workspace -y` (add `-g` when this skill lives in the global skills directory), then retry. A criterion the user did not state stays `Unknown`; nothing is derived from `ORG.md`.

## QC

- The 13 fields appear in order, one line each; nested bullets only under Location, Products and services, and Tech stack.
- The H1 is present and the folder name is its slug; empty optional sections are absent.
- `Saved.` follows a verified commit.

## References

[interactions](references/interactions.md) dialogues; `templates/ICP.md`; from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md), [company data](../gtm-workspace/references/company-data.md).
