---
name: gtm-setup
description: Set up, select, validate, or repair a git-backed GTM Context Project under $GTM_HOME (default ~/.gtm). Use when a user wants to start using GTM skills, create onboarding context, fix or repair gtm.yaml/AGENTS.md/organization/person/workspace files, switch active organization/person/workspace, seed setup context from company/product/profile links, or when any gtm-* skill cannot resolve a GTM Context Project.
metadata:
  function_tags: [sales, marketing, revops, customer-success, partnerships, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, csm, partnerships-lead, founder]
  requires_context: []
  composes: []
  output_mode: durable
  supports: [one-off]
---

# GTM Setup

Create, select, validate, and repair GTM Context Projects. A valid project is a git-backed Organization repository under `$GTM_HOME` with `gtm.yaml`, `organization.md`, one active Person, and one active GTM Workspace.

## Core Workflow

1. Resolve the setup mode.
   - Create a new project when the user asks to start, onboard, run setup, or no GTM Context Project can be resolved.
   - Select an existing project when the prompt, current directory, or registry identifies a valid project.
   - Validate or repair when a project exists but required scaffold pieces are missing.
   - Completion criterion: the mode and target project/path are known, or the next question asks only for a missing required setup answer.

2. Keep the simple path to three user interactions.
   - Ask for the Organization name.
   - Ask for the active Person display name and free-text role in one question.
   - Show all generated IDs and the file/commit preview in one combined confirmation, and include the optional enrichment prompt: "paste any links about your company, product, or you, or skip."
   - Default to the simple Organization -> Person -> GTM Workspace chain silently. If the user names a Business Unit or Team without being asked, include that deeper chain.

3. Build the GTM Setup Model before writing.
   - Resolve `$GTM_HOME` (default `~/.gtm`), registry path, Organization ID/path, Person ID/path, Workspace ID/path, optional Business Unit/Team IDs, timestamps, intended writes, and git actions.
   - Do not write local active state until the shared scaffold is valid enough to use.
   - Read [setup-and-repair.md](references/setup-and-repair.md) before writing or repairing files.

4. Confirm durable writes before execution.
   - Use a concise file/section preview, not a raw full diff by default.
   - State whether git will be initialized, whether an initial or repair commit will be created, and that no remote push, outreach, CRM update, or campaign action will happen.
   - If source links are provided, read [enrichment-and-safety.md](references/enrichment-and-safety.md), use `scripts/classify_source_links.py` when available to classify links, draft bounded setup context, and show the enrichment preview before writing enriched facts or safe source labels.

5. Write or repair deterministically.
   - Use the files in `templates/` for the scaffold: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and optional Business Unit/Team files.
   - Create `business-units/` and `teams/` directories even when they only contain `.gitkeep` placeholders.
   - Do not create skill-owned files such as `icps.md`, `personas.md`, or `scoring.md`.

6. Update local registry and git last.
   - Preserve unknown fields in `$GTM_HOME/registry.json` and project `gtm.yaml`.
   - Initialize git by default for new projects unless the user explicitly opts out.
   - Create `Initialize GTM context project` after successful new setup, or `Repair GTM context scaffold` after safe repair writes.
   - Never push by default. If git commit fails, keep written files and report the blocker.

7. End with the setup summary.
   - Include Organization ID/path, active Person and Workspace, files created/preserved/repaired, git status, enrichment status, omitted/redacted source counts, unresolved enrichment questions, and next recommended skills.
   - Recommend `gtm-define-icp` and `gtm-define-personas` for new projects.

## Context Resolution Contract

When resolving a GTM Context Project for setup, selection, or repair:

1. Use explicit user instruction in the prompt when the user names a GTM project, Organization ID, project path, workspace, or person.
2. If the current working directory is inside a GTM Context Repository, use the nearest ancestor containing `gtm.yaml`.
3. Otherwise use the active project in `$GTM_HOME/registry.json`.

After choosing the project, resolve the active Person and GTM Workspace from explicit prompt values, then registry local state, then the project's `default_workspace`. If no project resolves, say:

> I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

## Blocking Rules

- Missing Organization name, active Person display name, active Person role, or generated ID confirmation blocks creation.
- Missing or unresolved enrichment answers do not block setup; leave sparse sections or open questions.
- Unclear source-assisted claims that affect GTM decisions must not be written as facts until confirmed.
- Existing human-authored files must not be overwritten unless the user explicitly asks to regenerate or replace them.

## Verification Checklist

- `gtm.yaml` has required fields, omits unknown optional fields, and references files that exist.
- `AGENTS.md` encodes the prompt -> CWD -> registry context-resolution order, and `CLAUDE.md` contains `@AGENTS.md`.
- Local active state is only in `$GTM_HOME/registry.json`, never in committed project files.
- `.gitignore` protects local state, secrets, temporary files, logs, and ephemeral outputs.
- The commit, if created, stages only the current setup or repair change set and never pushes.
- The final summary distinguishes created, preserved, repaired, skipped, and failed steps.

See [examples.md](references/examples.md) for a concrete Northstar Compliance setup shape.
