# Setup And Repair

Load this reference before creating, selecting, validating, or repairing a GTM Context Project.

## GTM Setup Model

Build an in-memory model before writing anything:

- `gtm_home`: `$GTM_HOME` when set, otherwise `~/.gtm`
- `registry_path`: `<gtm_home>/registry.json`
- `organization`: `id`, `display_name`, `path`, optional known fields such as `website`, `category`, `stage`, `headquarters`
- `person`: `id`, `display_name`, `role`, optional `email`, `path`, `default_workspace`
- `workspace`: `id`, `display_name`, `path`, optional `business_unit`, `team`, `motion`, `market`, `offering`
- optional `business_unit`: `id`, `display_name`, `path`
- optional `team`: `id`, `display_name`, `path`
- `writes`: files to create, preserve, repair, or skip
- `git`: whether to initialize, commit, or skip git
- `enrichment`: `skipped`, `unavailable`, `proposed-but-not-applied`, `partially-applied`, or `applied`

Only write after the required IDs, paths, and intended write set are known.

## Fast Path Interaction Shape

For a simple new project, keep setup under three user interactions:

1. Ask: "What organization, company, client, or account should this GTM Context Project be for?"
2. Ask: "Who are you for this context? Please give your display name and role."
3. Show a combined confirmation:
   - Organization ID and repo path
   - Person ID and file path
   - Workspace ID and folder path
   - files to create
   - git init/commit intent
   - explicit note that no push, outreach, CRM update, or campaign action will happen
   - optional enrichment prompt: "Paste any links about your company, product, or you, or say skip."

If the user confirms and skips links, write the sparse scaffold. If the user provides links, enter the enrichment branch; enrichment-heavy setup can exceed the three-interaction simple-path budget.

Do not ask a setup-depth question by default. Use the simple Organization -> Person -> GTM Workspace chain unless the user already mentioned a Business Unit, Team, market, motion, or workspace name.

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
- If required scaffold pieces are missing, offer or perform non-destructive repair.
- Add missing files and folders only.
- Merge missing `.gitignore` rules without deleting user rules.
- Preserve existing `AGENTS.md`, `organization.md`, Person files, and Workspace context unless the user explicitly asks to regenerate or replace them.
- Preserve unknown fields in `registry.json` and `gtm.yaml`.
- If repair writes safe scaffold changes, create `Repair GTM context scaffold`.

Never use broad overwrite behavior. Regeneration, deletion, or substantial rewrite requires explicit user intent and a preview.

## Git Behavior

- Run `git init` by default for new project folders that are not already git repositories.
- Do not create a remote by default.
- Create `Initialize GTM context project` after successful new setup when files are commit-safe.
- Do not create another initial commit if the project already has commits.
- Stage only current setup or repair files, never unrelated working-tree changes.
- If git is missing, user identity is not configured, hooks fail, or commit fails, keep written files and report that changes remain uncommitted.
- Never push by default.

## Setup Summary

End every successful create, select, validate, or repair with:

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

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas
```
