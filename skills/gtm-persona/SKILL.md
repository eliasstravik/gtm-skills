---
name: gtm-persona
description: Triggers when a user asks to create, update, delete, or check a buyer or stakeholder persona in a GTM workspace, with phrasings like "create a persona for revenue leaders", "the persona should speak English", "delete the CMO persona", or "check the personas". Owns the persona files and their 11 person criteria. Not for the workspace or its members (gtm-workspace), ICPs (gtm-icp), checking a given person against a persona (gtm-qualify-prospects), or workflows that score people on a schedule (gtm-workflow).
---

# GTM Persona

## Trigger

Apply this skill when a request creates, changes, removes, or checks a persona in a GTM workspace.

## Scope

This skill owns `personas/<slug>/PERSONA.md` in the workspace found by [the contract](../gtm-workspace/references/contract.md). A persona records desired or accepted criteria for target people in the 11 fields of [person data](../gtm-workspace/references/person-data.md), never facts about the organization or its members.

## Inputs

Criteria from the user or sources the user supplies; the existing personas, for the near-duplicate check; the names of personas copied into `workflows/workflows/*.ts`, for the copy notice.

## Roles

The user approves every change through the host's write permission; the agent proposes, edits, commits, and reports.

## Procedure

Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md).

| Job | Do |
| --- | --- |
| Create | When an existing persona overlaps the request, offer Update first. When the titles that define the persona are unstated, ask with options. Copy `templates/PERSONA.md` to `personas/<slug>/PERSONA.md`, fill only the criteria the user gave, leave the rest `Unknown`, and say the rest stays Unknown because criteria are never borrowed from the company record or members. Omit `## Person signals` and `## Disqualifiers` when empty. |
| Update | Change the named criteria, signals, or disqualifiers. When a workflow file names this persona, say that workflow keeps its own copy of the criteria until it is updated. |
| Delete | When no persona has the given name, offer the closest matches as options. Say whether a workflow carries a copy, which keeps running. Remove `personas/<slug>/`; close with what disappeared and that it stays in the workspace's history. |
| Doctor | Flag a persona with no person-matchable criterion (every field `Unknown`), a placeholder husk, a missing H1, or a folder name that is not its slug; offer the fixes as options; rewrite what the user accepts. |

Every save: one sentence on what will change, pull first when `origin/main` exists, edit through the host's write path, commit on `main` with a plain-language message, push when a remote exists, verify the commit (and that it reached `origin/main` when a remote exists), close with what was created, changed, or deleted.

## Outputs

`personas/<slug>/PERSONA.md` in the template's shape, each change a commit on `main`.

## Exceptions

Requires the `gtm-workspace` skill installed alongside this one; when `../gtm-workspace/SKILL.md` is missing, say: install it the same way this skill was installed, with `npx skills add eliasstravik/gtm-skills -s gtm-workspace -y` (add `-g` when this skill lives in the global skills directory), then retry. A criterion the user did not state stays `Unknown`; nothing is derived from `ORG.md` or `MEMBER.md`.

## QC

- The 11 fields appear in order, one line each.
- The H1 is present and the folder name is its slug; empty optional sections are absent.
- The closing statement of what changed follows a verified commit.

## References

[interactions](references/interactions.md) dialogues; `templates/PERSONA.md`; from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md), [person data](../gtm-workspace/references/person-data.md).
