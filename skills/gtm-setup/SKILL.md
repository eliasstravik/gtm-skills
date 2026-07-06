---
name: gtm-setup
description: Set up, register, switch, validate, or extend a fractal GTM context repo. Use when the user wants to start using GTM skills, create or register a company context, change the active org/suborg or person, add a suborg, seed setup from company or profile links, join a shared repo, or recover after another gtm skill cannot resolve context.
---

# GTM Setup

Create and maintain a git-backed GTM context repo for one company. Default
`$GTM_HOME` to `~/.gtm`; local machine state lives only in
`$GTM_HOME/state.json`.

## Model

A context repo has one root company org, plus optional recursive suborgs. Every
org node has the same shape:

```text
<org>/
  org.md
  icps/
  personas/
  <skill-owned files>
  suborgs/<child-org>/
```

Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
`people/<person-id>/person.md`. Folder names are lowercase kebab-case ids. The
H1 in `org.md` or `person.md` is the display name. Do not create empty
directories, placeholders, or a default suborg.

Canonical org paths omit the physical `suborgs/` segments: `cloud/emea` means
`suborgs/cloud/suborgs/emea`; root is empty.

## Core Workflow

1. Pick the mode.
   - Create: make a new context repo, initial root `org.md`, initial
     `people/<you>/person.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, git init,
     first local commit, and `state.json` registration.
   - Register: validate an existing or cloned context repo, add it to
     `state.json`, create the requested person file if absent, and set pins.
   - Switch: update `state.json` active project, org path, or person only.
   - Add suborg: create `suborgs/<id>/org.md` below root or a named org path.
   - Validate/repair: check setup-owned files and repair only after preview.
   - Share/sync/publish: only when explicitly requested.

2. Resolve current context.
   - Project: explicit project/path/company in the prompt -> current directory
     inside a context repo (nearest ancestor with root `org.md` and
     `AGENTS.md`) -> `state.json` active project -> ask when multiple projects
     exist and none is active.
   - Org: explicit org path in the prompt -> project pin in `state.json` ->
     root.
   - Person: explicit person in the prompt -> project pin -> sole person in
     root `people/` -> ask when the action needs a person.
   - Echo the result before acting: `Working in <project>/<org-path>` and add
     `as <person>` only when a person resolves.
   - If no context resolves, say: `I could not resolve a GTM context repo from
     this prompt, current directory, or local state. Run gtm-setup or tell me
     which GTM project to use.`

3. Enforce path safety.
   - Canonicalize repo roots and derived paths before reading or writing.
   - Reject ids that are absolute, contain `..`, include path separators, are
     not lowercase kebab-case, or resolve outside the repo through symlinks.
   - Treat `state.json` paths as authoritative; expand `~` and environment
     variables, and resolve relative paths against `$GTM_HOME` only when a
     hermetic fixture intentionally uses them.

4. Handle create mode.
   - Ask only for missing essentials: company display name, optional website or
     public source links, initial person name, role, focus, and optional profile
     links.
   - Before source-assisted enrichment, say: `This takes a couple of minutes -
     I am researching so you do not have to type it.`
   - Generate and preview ids, target path, files, source-link treatment, git
     behavior, and `state.json` update before writing.
   - If the target path exists and is non-empty, never overwrite silently. If it
     is already a valid context repo, offer register mode. Otherwise offer to
     archive it to `$GTM_HOME/backups/<name>-<timestamp>/` and recreate only
     after explicit confirmation.
   - Write only setup-owned identity files. Do not create `icps/`,
     `personas/`, scoring files, research folders, or suborgs unless the mode
     explicitly requires them.

5. Handle register mode.
   - Accept a local path or a cloned repo path. Clone a GitHub URL only after
     confirming the target path; keep remotes and history intact.
   - Validate root `org.md` plus `AGENTS.md`. If either is missing, reject the
     repo as not yet a GTM context repo and offer create mode or repair after
     confirmation.
   - Compare `AGENTS.md` and `CLAUDE.md` to the packaged contract. Missing
     setup-owned files are repairable after preview; substantive differences
     need explicit approval before activation.
   - Create `people/<id>/person.md` only when the requested person is absent
     and the user confirms the preview.

6. Handle add-suborg mode.
   - Resolve the parent org first.
   - Ask for suborg display name and optional positioning/focus when missing.
   - Preview the canonical org path and physical file path.
   - Create exactly `suborgs/<id>/org.md`. Do not create child collections or
     skill files.

7. Classify source links before durable writes.
   - Use `scripts/classify_context_links.py --stdin --json` when available,
     one URL per input line.
   - Public first-party links may be saved after confirmation. Private links
     require explicit confirmation and should usually become safe labels.
   - Secret-bearing, invite, tokenized, signed, credential-bearing, local-only,
     or private-tunnel links are never committed or printed back verbatim.
   - Low-confidence claims become open questions, not facts.

8. Manage local state last.
   - `state.json` shape:
     ```json
     {
       "active": "google",
       "projects": {
         "google": {
           "path": "~/.gtm/google",
           "org": "cloud/emea",
           "person": "elias-stravik"
         }
       }
     }
     ```
   - Project id defaults to the repo directory basename. On collision, ask
     whether to replace, rename, or keep both under distinct ids.
   - Update pins only on explicit user request or as part of create/register.
   - Never commit `state.json`.

9. Commit only confirmed setup changes.
   - Initialize git by default for new repos unless the user opts out.
   - Commit only setup-owned files with `Initialize GTM context repo` or
     `Repair GTM context repo`.
   - Never push, open a PR, update CRM, trigger outreach, or sync externally
     unless that mode was explicitly requested and confirmed.

10. End with a setup summary.
    - Include resolved project, org path, person, created/preserved/repaired/
      skipped/failed files, source-link handling, state update, git status, and
      any open questions.
    - Recommend `gtm-define-icp` and `gtm-define-personas` only when those
      collections are absent and the user is ready to define targeting context.

## Blocking Rules

- Missing company display name, initial person display name/role, unresolved
  path collision, unsafe id, or unconfirmed archive/rewrite blocks create.
- Missing `org.md` or root `AGENTS.md` blocks register until repaired or a new
  repo is created.
- Missing source-enrichment facts do not block setup; keep files sparse and
  record open questions.
- Divergent instruction files block activation until the user approves the
  differences.
- Never overwrite human-authored files without explicit confirmation.

## Verification Checklist

- Root has `org.md`, `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and root-only
  `people/<id>/person.md`.
- `CLAUDE.md` contains exactly `@AGENTS.md`.
- No empty directories or placeholder files were created.
- Org paths in `state.json` use canonical form and resolve to existing orgs.
- Every durable write was previewed and confirmed.
- No local state, secrets, raw scratch, or ephemeral output was committed.
