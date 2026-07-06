---
name: gtm-setup
description: Set up, select, validate, or repair a local GTM context project. Use when the user wants to start using GTM skills, switch the active workspace, fix context files, seed setup from company or profile links, or recover after another gtm skill cannot resolve context.
---

# GTM Setup

Create and maintain a GTM context project: a git-backed organization
folder under `$GTM_HOME` with durable workspace context. Default
`$GTM_HOME` to `~/.gtm`.

## Core Workflow

1. Pick the mode.
   - Create when the user is onboarding or no project resolves.
   - Select when the user names an existing project, person, or workspace.
   - Validate or repair when a project resolves but required files are absent,
     inconsistent, or placeholder-only.
   - Completion criterion: the mode, target `$GTM_HOME`, and target project
     are known, or the next question asks only for the missing required setup
     answer.

2. Resolve context in this order.
   - Explicit project, path, organization, person, or workspace in the prompt.
   - The nearest current-directory ancestor containing `gtm.yaml`.
   - `$GTM_HOME/registry.json`, using `active_project_id` first, then the only
     registered project when exactly one exists.
   - After selecting a project, resolve person and workspace from explicit
     prompt values, registry active state, then `gtm.yaml` defaults.
   - Before any read, write, stage, or commit, canonicalize the project root.
     IDs inside a project must be lowercase slug ids; reject derived child
     paths that are absolute, contain `..`, or resolve outside the project root,
     including symlink escapes.
   - If nothing resolves, say exactly: `I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run gtm-setup or tell me which GTM project to use.`

3. Keep creation tight.
   - Ask for organization name, active person name, and active person role
     only when missing.
   - Generate lowercase kebab-case ids; show them before writing.
   - Default to one organization, one person, and one `default` workspace.
     Add business units or teams only when the user already named them.
   - Completion criterion: every id, path, write target, and registry update is
     previewable before the filesystem changes.

4. Guard source links.
   - Classify provided company, product, CRM, profile, or documentation links
     with `scripts/classify_source_links.py` when available.
   - Prefer `scripts/classify_source_links.py --stdin --json` with one link per
     stdin line. If stdin is unavailable, pass links as separate argv entries
     after `--`; never concatenate raw links into a shell command.
   - Public links may be saved after confirmation. Private links need explicit
     confirmation and should usually become safe labels. Secret-bearing,
     invite, tokenized, or local-only links are never committed.
   - Completion criterion: every source link is saved, labeled, or omitted with
     a reason.

5. Preview durable writes.
   - Show the files and sections to create, repair, preserve, or skip.
   - State whether git will be initialized and whether a local commit will be
     attempted.
   - State that no remote push, CRM update, outreach, campaign, or sync will
     happen.
   - Wait for explicit confirmation before writing new or repaired durable
     project files.

6. Write deterministically.
   - Use `templates/` for `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`,
     `organization.md`, `people/<person-id>.md`, and
     `workspaces/<workspace-id>/context.md`.
   - Create `business-units/` and `teams/` with `.gitkeep` placeholders.
   - Do not create `icps.md`, `personas.md`, `account-scoring.md`, or
     `lead-scoring.md`; those are owned by later skills.
   - Preserve human-authored files unless the user explicitly confirms a
     replacement.

7. Update registry and git last.
   - Keep active local state in `$GTM_HOME/registry.json`, never in committed
     project files.
   - Preserve unknown registry and `gtm.yaml` fields.
   - Initialize git by default for new projects unless the user opts out.
   - Commit only the confirmed setup or repair files with `Initialize GTM context project` or `Repair GTM context project`; never push.
   - If commit fails, keep the written files and report the blocker.

8. End with a setup summary.
   - Include project path, active person, active workspace, files created,
     files preserved, files repaired, source-link handling, git status, and
     unresolved open questions.
   - Report `created`, `preserved`, `repaired`, `skipped`, and `failed`
     buckets explicitly, using `none` for empty buckets. This keeps
     validation and repair runs reviewable without making the reader infer
     whether a category was checked or forgotten.
   - Recommend `gtm-define-icp` and `gtm-define-personas` for a new project.

## Project Contract

A valid project contains:

- `gtm.yaml` with `version: 1`, organization id/display name,
  `default_workspace`, people, workspaces, and optional business units/teams.
- `AGENTS.md` and `CLAUDE.md`, where `CLAUDE.md` contains `@AGENTS.md`.
- `organization.md`.
- `people/<person-id>.md`.
- `workspaces/<workspace-id>/context.md`.
- `.gitignore` protecting local state, secrets, logs, and ephemeral outputs.

Skill-owned workspace files are created later:

- `gtm-define-icp` owns `workspaces/<workspace-id>/icps.md`.
- `gtm-define-personas` owns `workspaces/<workspace-id>/personas.md`.
- `gtm-account-scoring` owns `workspaces/<workspace-id>/account-scoring.md`.
- `gtm-lead-scoring` owns `workspaces/<workspace-id>/lead-scoring.md`.
