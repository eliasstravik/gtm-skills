---
name: gtm-workspace
description: Triggers when a user asks to create, set up, import, open, check, repair, or share a GTM workspace for an organization, or to add, change, or remove its members or company facts, with phrasings like "set up a GTM workspace for Acme", "add Priya to the team", "check the workspace", or "share the Acme workspace". Owns the workspace repository, the organization record, members, and workspace health, and hosts the standards every other gtm skill links to. Not for ICPs, personas, prospect fit checks, or saved workflows, which belong to gtm-icp, gtm-persona, gtm-qualify-prospects, and gtm-workflow.
---

# GTM Workspace

## Trigger

Apply this skill when a request concerns a GTM workspace as a whole, its organization facts, or its members.

## Scope

One workspace holds one organization's GTM context as Markdown under `~/.gtm/<org-slug>/`, with git as its memory. This skill owns the workspace root, `ORG.md`, `members/`, and workspace health, and hosts the shared standards in `references/`. ICPs, personas, fit checks, and `workflows/` belong to the other gtm skills; Doctor never inspects the internals of `workflows/`.

Workflow hosting and provider connections belong to `gtm-workflow`. Route standalone Local or Vercel setup to its shared `scripts/setup.mjs`; do not require GTM Agent or Slack. Workspace Doctor delegates connection health to that skill's Doctor.

## Inputs

The request; the workspace found by the discovery order in [the contract](references/contract.md); facts from the user, the company's own public site, and other safe public sources, never invented; a member's email from the user or a source, never inferred.

## Roles

The user approves every change through the host's write permission; the agent proposes, edits, commits, and reports.

## Procedure

Talk by the six rules in [interaction](references/interaction.md); reproduce [the dialogues](references/interactions.md).

| Job | Do |
| --- | --- |
| Create | When `~/.gtm/` already holds an empty clone with a remote (empty, or holding only `workflows/`, which shared `gtm-workflow` setup can publish first), scaffold into it, take its directory name as the slug, do not ask where it lives, and after the commit run `git push -u origin main`; a clone that is neither empty nor a workspace (a GitHub-initialised README, say) is reported as a problem in business terms, never scaffolded over. Otherwise ask where it lives: this computer only (recommended), or also a private GitHub repository named `gtm-<slug>`, and `git init` on `main`. Copy `templates/AGENTS.md`, `CLAUDE.md`, `ORG.md`, and `gitignore` (as `.gitignore`) into `~/.gtm/<slug>/`, fill `ORG.md` from the user and public sources, commit, and when shared run `gh repo create gtm-<slug> --private --source . --push`; the first push into an empty repository is `git push -u origin main`. Import is Create by copying or cloning an existing workspace into `~/.gtm/<slug>/` instead of scaffolding. |
| Update | Change `ORG.md` facts, or add, change, or remove `members/<slug>/MEMBER.md` from the template; email is required. |
| Doctor | Compare the root shape and every file to `templates/` and the contract; report deviations in business terms; offer the fixes as options; rewrite what the user accepts, including legacy layouts (a root README, `suborgs/`, missing or misordered fields); `.github/` belongs to `gtm-workflow`'s Doctor. The workspace slug is the directory name, never derived from the H1. |

Every save: one sentence on what will change, pull first when `origin/main` exists, edit through the host's write path, commit on `main` with a plain-language message, push when a remote exists, verify the commit (and that it reached `origin/main` when a remote exists), close with what was created, changed, or deleted.

## Outputs

A workspace with the root shape in [the contract](references/contract.md), every change a commit on `main`, and, when shared, a private GitHub repository `gtm-<slug>`.

## Exceptions

Several workspaces match and none is named: ask, never save a preference. A fact cannot be confirmed: write `Unknown`. A member without an email is not created. Asked to delete a whole workspace: the agent never does; say so, and that the user removes the folder, or the GitHub repository when shared. Legacy `suborgs/` units become prose under `## Notes` in `ORG.md`, or their own workspace when the user wants separate GTM context.

## QC

- `ORG.md` has the 13 fields of [company data](references/company-data.md) in order, one line each; nested bullets only under Location, Products and services, and Tech stack.
- The root carries only what [the contract](references/contract.md) lists; the pointer files and `.gitignore` match their templates byte for byte.
- Every slug follows the contract's rule; every member has an email.
- The closing statement of what changed follows a verified commit.

## References

[interaction](references/interaction.md) rules; [interactions](references/interactions.md) dialogues; [contract](references/contract.md) for slugs, discovery, root shape, sourcing, and sharing; [company data](references/company-data.md) and [person data](references/person-data.md) vocabularies; `templates/` for `AGENTS.md`, `CLAUDE.md`, `ORG.md`, `gitignore`, and `MEMBER.md`.
