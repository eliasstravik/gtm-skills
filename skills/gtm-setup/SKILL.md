---
name: gtm-setup
description: Set up, import, select, validate, repair, publish, or sync a local GTM context project. Use when the user wants to start using GTM skills, switch the active workspace, fix context files, seed setup from company or profile links, join/share a GTM context repo, or recover after another gtm skill cannot resolve context.
---

# GTM Setup

Create and maintain a GTM context project: a git-backed organization
folder under `$GTM_HOME` with durable workspace context. Default
`$GTM_HOME` to `~/.gtm`.

## Core Workflow

1. Pick the mode.
   - Create when the user is onboarding or no project resolves.
   - Import when the user gives a local path, GitHub URL, or asks to join a
     shared GTM context repo.
   - Select when the user names an existing project, person, or workspace.
   - Validate or repair when a project resolves but required files are absent,
     inconsistent, or placeholder-only.
   - Publish or sync only when the user explicitly asks to share, collaborate,
     go multiplayer, publish to GitHub, or save/share a session batch.
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
   - Ask for organization name and website when missing.
   - Ask for active person name, role, and professional/social profile links
     when missing.
   - Before source-assisted research, say: `this takes a couple of minutes - I'm researching so you don't have to type it.`
   - Generate lowercase kebab-case ids; show them before writing.
   - Default to one organization, one person, and one `default` workspace.
     Add business units or teams only when the user already named them.
   - Do not ask long-form "describe your company" or "describe yourself"
     questions. Do not infer goals, motivations, working preferences,
     personality, priorities, or soft attributes during onboarding; leave them
     sparse or as open questions.
   - Completion criterion: every id, path, write target, and registry update is
     previewable before the filesystem changes.

4. Guard source links and enrichment.
   - Classify provided and discovered company, product, CRM, profile, or
     documentation links with `scripts/classify_source_links.py` when available.
   - Prefer `scripts/classify_source_links.py --stdin --json` with one link per
     stdin line. If stdin is unavailable, pass links as separate argv entries
     after `--`; never concatenate raw links into a shell command.
   - Public links may be saved after confirmation. Private links need explicit
     confirmation and should usually become safe labels. Secret-bearing,
     invite, tokenized, signed, credential-bearing, local-only, or
     private-tunnel links are never committed.
   - Auto-apply only high-confidence facts: company facts need a public
     first-party or clearly official source, and person facts need company
     co-mention or another strong public link to the organization.
   - Research scratch belongs in the ignored `research/` directory. Do not
     commit raw scratch notes, extraction dumps, unresolved claims, or `.tmp/`
     job workspaces.
   - Completion criterion: every source link is saved, labeled, or omitted with
     a reason, and low-confidence claims are either confirmed or left as open
     questions.

5. Handle import before activation.
   - GitHub URL imports clone under `$GTM_HOME/<slug>`; if the path collides,
     append a readable numeric suffix.
   - Local path imports register the existing absolute path in place; do not
     copy it under `$GTM_HOME`.
   - Compare imported `AGENTS.md` and `CLAUDE.md` against the packaged static
     templates. Missing instruction files are repairable after confirmation;
     substantive differences require explicit user approval before registering
     or activating the project.
   - Parse `gtm.yaml` before activation. A valid imported project has at least
     `version`, `organization.id`, `organization.display_name`, and
     `default_workspace`.
   - If `gtm.yaml` is absent, broken, or lacks organization id/name, reject the
     import as not a GTM project and offer to start fresh using the path's
     contents as source material.
   - Private-repo clone auth failures should point at the user's existing `gh`
     or SSH auth setup. Never handle credentials, never push, and preserve
     imported history/remotes.

6. Preview durable writes.
   - Show the files and sections to create, repair, preserve, or skip.
   - State whether git will be initialized and whether a local commit will be
     attempted.
   - State that no remote push, CRM update, outreach, campaign, or sync will
     happen unless the user explicitly requested publish or sync mode.
   - Before committing person facts, state that confirmed person facts will be
     committed to the Organization repo, which may be shared later; let the user
     trim, remove, or leave person facts sparse.
   - Wait for explicit confirmation before writing new or repaired durable
     project files.

7. Write deterministically.
   - Use `templates/` for `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`,
     `organization.md`, `people/<person-id>.md`, and
     `workspaces/<workspace-id>/context.md`.
   - Create `business-units/` and `teams/` with `.gitkeep` placeholders.
   - Do not create `icps.md`, `personas.md`, `account-scoring.md`, or
     `lead-scoring.md`; those are owned by later skills.
   - Preserve human-authored files unless the user explicitly confirms a
     replacement.

8. Publish or sync only on explicit user intent.
   - Default setup stays local-only: `git init`, a local commit, no remote, and
     no push.
   - Joining a shared project is the import path, not a separate mechanism.
   - Publishing creates a private GitHub repo by default and pushes current
     context only after explicit confirmation.
   - Session-batched sync reviews the local diff, pulls/rebases latest `main`,
     creates a session branch, commits only the confirmed context edits, pushes
     after confirmation, and opens a PR with `gh pr create`.
   - Never force-push over teammates. If pull/rebase, branch push, PR creation,
     or merge fails, report the blocker and leave local files intact.

9. Update registry and git last.
   - Keep active local state in `$GTM_HOME/registry.json`, never in committed
     project files.
   - Preserve unknown registry and `gtm.yaml` fields.
   - Initialize git by default for new projects unless the user opts out.
   - Commit only the confirmed setup or repair files with
     `Initialize GTM context project` or `Repair GTM context project`.
   - Never push outside explicit publish or sync mode. If commit fails, keep
     the written files and report the blocker.

10. End with a setup summary.
    - Include project path, active person, active workspace, files created,
      files preserved, files repaired, source-link handling, git status,
      import/publish/sync status, and unresolved open questions.
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
- `.gitignore` protecting local state, secrets, logs, `research/`, and
  ephemeral outputs such as `.tmp/`.

Skill-owned workspace files are created later:

- `gtm-define-icp` owns `workspaces/<workspace-id>/icps.md`.
- `gtm-define-personas` owns `workspaces/<workspace-id>/personas.md`.
- `gtm-account-scoring` owns `workspaces/<workspace-id>/account-scoring.md`.
- `gtm-lead-scoring` owns `workspaces/<workspace-id>/lead-scoring.md`.

## Blocking Rules

- Missing organization name, active person display name, active person role, or
  generated ID confirmation blocks creation.
- Path-escaping ids or child paths block all reads, writes, staging, and
  commits until corrected.
- Missing or unresolved enrichment answers do not block setup; leave sparse
  sections or open questions.
- Unclear source-assisted claims that affect GTM decisions must not be written
  as facts until confirmed.
- Imported projects with divergent `AGENTS.md` or `CLAUDE.md` block activation
  until the user explicitly approves the nonstandard instruction text.
- Missing or broken `gtm.yaml` with no repair path blocks import; present a
  start-fresh option using the imported contents as source material.
- Existing human-authored files must not be overwritten unless the user
  explicitly asks to regenerate or replace them.

## Verification Checklist

- `gtm.yaml` has required fields, omits unknown optional fields, and references
  files that exist.
- `AGENTS.md` encodes the prompt -> CWD -> registry context-resolution order,
  path-safety rules, source-link safety, and `.tmp/` job workspace guidance;
  `CLAUDE.md` contains `@AGENTS.md`.
- Local active state is only in `$GTM_HOME/registry.json`, never in committed
  project files.
- `.gitignore` protects local state, secrets, temporary files, logs,
  `research/`, and `.tmp/` ephemeral job workspaces.
- Imports passed the instruction trust gate and parseable `gtm.yaml` structure
  gate before activation.
- The commit, if created, stages only the current setup or repair change set and
  never pushes outside explicit publish or sync mode.
- Multiplayer pushes happened only after explicit user confirmation, when that
  mode was requested.
- The final summary distinguishes created, preserved, repaired, skipped, and
  failed steps.
