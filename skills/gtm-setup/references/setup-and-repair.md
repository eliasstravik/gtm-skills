# Setup And Repair

Load this reference before creating, importing, selecting, validating, repairing, publishing, or syncing a GTM Context Project.

## GTM Setup Model

Build an in-memory model before writing anything:

- `gtm_home`: `$GTM_HOME` when set, otherwise `~/.gtm`
- `registry_path`: `<gtm_home>/registry.json`
- `organization`: `id`, `display_name`, `path`, optional known fields such as `website`, `category`, `stage`, `headquarters`
- `person`: `id`, `display_name`, `role`, optional `email`, `path`, `default_workspace`
- `workspace`: `id`, `display_name`, `path`, optional `business_unit`, `team`, `motion`, `market`, `offering`
- optional `business_unit`: `id`, `display_name`, `path`
- optional `team`: `id`, `display_name`, `path`
- `mode`: create, import, select, validate, repair, publish, or sync
- `sources`: user-provided and discovered public/profile links, classified before saving
- `trust`: imported instruction-file comparison results and required approvals
- `writes`: files to create, preserve, repair, or skip
- `git`: whether to initialize, commit, clone, add a remote, push, or skip git
- `enrichment`: `skipped`, `unavailable`, `proposed-but-not-applied`, `partially-applied`, or `applied`

Only write after the required IDs, paths, and intended write set are known.

## Import-Or-Fresh Gate

When starting setup without a resolved project, ask one concise choice question:

1. Start fresh.
2. Import an existing GTM context repo.
3. Switch to an existing registered project, only when the registry already has projects.

Use AskUserQuestion or an equivalent interaction tool when available. Otherwise present numbered options. "Start fresh" is first/default.

## Fresh Setup Interaction Shape

Fresh setup is sequential and facts-first:

1. Company block.
   - Ask for company name and website.
   - State: "this takes a couple of minutes - I'm researching so you don't have to type it."
   - Research facts anchored on the provided domain: official site, docs, public proof pages, and news when available.
   - Draft a compact `organization.md` summary.
   - Ask only targeted questions for low-confidence, conflicting, inferred, or unanchored facts.
   - Auto-apply a fact only when it appears on a public first-party page with domain anchoring.
2. Person block.
   - Ask for person name, job title, and professional/social profile links.
   - State the same research expectation line before researching.
   - Research facts only. Person facts require company co-mention; unanchored facts become targeted questions.
   - Use public web search fallback for auth-walled profiles such as LinkedIn. Save the supplied profile URL as a source link when it passes link safety.
   - Before confirmation, state that confirmed person facts will be committed to the Organization repo, which may be shared later; let the user trim facts before writing.
3. Silent default workspace.
   - Create `workspaces/default/` and seed `context.md` only with confirmed company-level facts that fit the workspace scope, such as offering or market.
   - Do not surface the workspace concept during onboarding.
   - Do not guess a GTM motion.
4. Combined ID and write preview.
   - Organization ID and repo path.
   - Person ID and file path.
   - Workspace ID and folder path.
   - Files to create.
   - Git init/commit intent.
   - Explicit note that no push, outreach, CRM update, or campaign action will happen.

Do not ask long-form "describe your company" or "describe yourself" questions. Do not infer goals, motivations, working preferences, or soft attributes during onboarding; leave those sections sparse or as open questions.

If the registry already has a project with the same Organization slug, present options to select the existing project or add the person to it instead of creating a duplicate. A second person setup creates `people/<person-id>.md` and updates registry local active state only.

Do not ask a setup-depth question by default. Use the simple Organization -> Person -> GTM Workspace chain unless the user already mentioned a Business Unit, Team, market, motion, or workspace name.

## Import Path

Use import when the user provides a GitHub URL, local path, or asks to join a shared project.

- GitHub URL imports clone under `$GTM_HOME/<slug>`. If the destination exists, append `-2`, `-3`, and so on until the path is clear.
- Local path imports register the existing absolute path in place. Do not copy it under `$GTM_HOME`.
- Private-repo clone/auth failures should be reported with a pointer to the user's existing `gh auth login` or SSH setup. Do not collect, paste, or handle credentials.
- Imports never push and never rewrite the imported repository's history or remotes.

Run both gates below before updating registry local active state.

### Instruction Trust Gate

Compare imported `AGENTS.md` and `CLAUDE.md` against the packaged static templates in `skills/gtm-setup/templates/`.

- Whitespace-only differences are near-identical and can proceed silently.
- Missing instruction files are repairable with the packaged templates, with user confirmation when writing repair files.
- Any substantive difference is divergent. Show the nonstandard imported content verbatim and require explicit approval before registering or activating the project.
- Never silently activate a project with divergent instructions.

`AGENTS.md` and `CLAUDE.md` templates are static instruction files. Do not expect template placeholders, live dates, IDs, or tokens in them.

### Structure Gate

Parse `gtm.yaml`. A valid imported project has at least:

- `version`
- `organization.id`
- `organization.display_name`
- `default_workspace`

If `gtm.yaml` is parseable and has org id/name, accept it as valid or repairable through the non-destructive repair rules below. Missing scaffold files such as `AGENTS.md`, `CLAUDE.md`, person files, workspace context, or `.gitignore` can be repaired after confirmation.

If `gtm.yaml` is absent, broken, or lacks org id/name, reject import as "not a GTM project." Present a start-fresh option using the path's contents as source material, but do not register or activate it as a project.

## ID Generation

Generate IDs as lowercase kebab-case.

- Organization ID: slugify Organization display name; disambiguate registry collisions with a readable suffix.
- Person ID: slugify display name; use email, username, employee ID, or numeric suffix when needed.
- Workspace ID: use `default` for simple setup; for deeper chains, use the most specific clear context such as Team, Business Unit, offering, market, motion, or role focus.
- Business Unit and Team IDs: slugify the display names and disambiguate within their maps.

Show generated Organization, Person, and Workspace IDs together and allow selective edits before writing. Once written, treat IDs as stable; later changes are rename/migration work, not casual setup edits.

## Deterministic Write Order

Write in this order:

1. Ensure `$GTM_HOME/registry.json` exists.
2. Create the Organization repo folder.
3. Initialize git if needed and not explicitly disabled.
4. Write or merge `.gitignore`.
5. Write `AGENTS.md`.
6. Write `CLAUDE.md` containing `@AGENTS.md`.
7. Write or update `gtm.yaml`, preserving unknown fields and omitting unknown optional fields.
8. Write `organization.md`.
9. Write optional `business-units/<business-unit-id>.md`.
10. Write optional `teams/<team-id>.md`.
11. Write `people/<person-id>.md`.
12. Write `workspaces/<workspace-id>/context.md`.
13. Update registry local active project/person/workspace.
14. Create the initial or repair git commit.

`gtm.yaml` may reference markdown files before those files are written, but every referenced file must exist before setup completes.

## Registry Shape

Use `$GTM_HOME/registry.json` as local state outside the GTM Context Repository:

```json
{
  "version": 1,
  "activeProject": "acme",
  "projects": {
    "acme": {
      "path": "~/.gtm/acme",
      "displayName": "Acme",
      "aliases": [],
      "createdAt": "2026-07-02T00:00:00Z",
      "lastUsedAt": "2026-07-02T00:00:00Z",
      "lastUpdatedAt": "2026-07-02T00:00:00Z",
      "local": {
        "activePerson": "jane-doe",
        "activeWorkspace": "default",
        "lastUsedAt": "2026-07-02T00:00:00Z"
      }
    }
  }
}
```

Preserve unknown registry fields. Do not commit `registry.json`; it is user-local state.

## Project Index Rules

`gtm.yaml` is a concise shared index. Required fields:

- `version: 1`
- `organization.id`
- `organization.display_name`
- `default_workspace`
- `business_units` map, empty when none exist
- `teams` map, empty when none exist
- `people.<person-id>.display_name`
- `people.<person-id>.role`
- `people.<person-id>.default_workspace`
- `people.<person-id>.path`
- `workspaces.<workspace-id>.display_name`
- `workspaces.<workspace-id>.path`

Omit unknown optional fields instead of writing `null`. Save long source lists in markdown files, not `gtm.yaml`.

## Select And Repair Modes

When a project already exists:

- If it is valid, update registry local active state and preserve project files.
- If required scaffold pieces are missing, ask before performing non-destructive repair.
- Add missing files and folders only.
- Merge missing `.gitignore` rules without deleting user rules.
- Preserve existing `AGENTS.md`, `organization.md`, Person files, and Workspace context unless the user explicitly asks to regenerate or replace them.
- Preserve unknown fields in `registry.json` and `gtm.yaml`.
- If repair writes safe scaffold changes, create `Repair GTM context scaffold`.

Never use broad overwrite behavior. Regeneration, deletion, or substantial rewrite requires explicit user intent and a preview.

## Ephemeral Job Workspaces

Template `.gitignore` must include `.tmp/`. Skills that need local SQLite, CSV, scripts, logs, or other throwaway work products should write them under:

```text
<project-root>/.tmp/<skill-name>/
```

These files are not durable context and must not be committed. Promote outputs only when the user explicitly asks and confirms a side-effect preview:

- write to the user's own system through MCP or a connector, or
- export a user-requested file.

Onboarding's own intermediate research scratch may use the ignored `research/` directory. Do not commit raw research scratch from `research/` or `.tmp/`.

## Git Behavior

- Run `git init` by default for new project folders that are not already git repositories.
- Do not create a remote by default.
- Create `Initialize GTM context project` after successful new setup when files are commit-safe.
- Do not create another initial commit if the project already has commits.
- Stage only current setup or repair files, never unrelated working-tree changes.
- If git is missing, user identity is not configured, hooks fail, or commit fails, keep written files and report that changes remain uncommitted.
- Never push by default. The only pushes this skill may perform are the explicit multiplayer pushes in [multiplayer.md](multiplayer.md), after user confirmation.

## Setup Summary

End every successful create, import, select, validate, repair, publish, or sync with:

```text
GTM context project ready

Organization
- ID: <organization-id>
- Path: <path>

Active local state
- Person: <person-id>
- Workspace: <workspace-id>

Files
- Created: <files or none>
- Preserved: <files or none>
- Repaired: <files or none>

Git
- Initialized repo: yes/no/already existed/skipped
- Commit: <message/hash or blocker>

Enrichment
- Source-assisted enrichment: skipped/unavailable/proposed-but-not-applied/partially-applied/applied
- Sources used: <count>
- Unresolved questions: <count>
- Links omitted/redacted for safety: <count>
- Safe source labels saved: <count>

Import / sharing
- Imported project: yes/no
- Trust gate: passed/repaired/approved divergence/not applicable
- Structure gate: passed/repaired/not applicable
- Published/shared: yes/no/not requested

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas
```
