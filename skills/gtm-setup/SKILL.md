---
name: gtm-setup
description: Set up, import, select, validate, repair, publish, or share a git-backed GTM Context Project under $GTM_HOME (default ~/.gtm). Use when a user wants to start using GTM skills, create onboarding context, import an existing GTM context repo, fix or repair gtm.yaml/AGENTS.md/organization/person/workspace files, switch active organization/person/workspace, seed setup context from company/product/profile links, share or collaborate on a GTM context project, publish to GitHub, go multiplayer, or when any gtm-* skill cannot resolve a GTM Context Project.
metadata:
  function_tags: [sales, marketing, revops, customer-success, partnerships, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, csm, partnerships-lead, founder]
  requires_context: []
  composes: []
  output_mode: durable
  supports: [one-off]
---

# GTM Setup

Create, import, select, validate, repair, and publish GTM Context Projects. A valid project is a git-backed Organization repository under `$GTM_HOME` with `gtm.yaml`, `organization.md`, one active Person, and one active GTM Workspace.

## Core Workflow

1. Resolve the setup mode.
   - Create a new project when the user asks to start, onboard, run setup, or no GTM Context Project can be resolved.
   - Import an existing project when the user gives a local path, GitHub URL, or says they want to join a shared GTM context repo.
   - Select an existing project when the prompt, current directory, or registry identifies a valid project.
   - Validate or repair when a project exists but required scaffold pieces are missing.
   - Publish or share when the user asks to collaborate, go multiplayer, publish to GitHub, or save/share a session batch.
   - Completion criterion: the mode and target project/path are known, or the next question asks only for a missing required setup answer.

2. Use the capability fallback ladder.
   - If an interactive question tool such as AskUserQuestion is available, use it for choice and clarification passes.
   - If no interactive question tool is available, present concise numbered options; every offered choice must be answerable by a tap or single number.
   - If parallel subagents are available, use them inside a research block; otherwise research sequentially with a bounded source list.
   - If web tools are unavailable, ask the user to paste the key public pages; if they decline or cannot, keep sparse templates and report what research was skipped.

3. Start with the import-or-fresh gate for new setup.
   - Ask whether to start fresh, import an existing GTM context repo, or switch to an existing registered project when the registry already has projects.
   - "Start fresh" is first/default.
   - Import follows the Trust And Structure Gates in [setup-and-repair.md](references/setup-and-repair.md).
   - Switching to an existing valid project updates only registry local active state.

4. For a fresh project, run atomic sequential onboarding blocks.
   - Company block: ask for company name and website, then say "this takes a couple of minutes - I'm researching so you don't have to type it." Research facts anchored on the provided domain, draft a compact `organization.md` summary, and ask only targeted questions for low-confidence, conflicting, inferred, or unanchored facts.
   - Person block: ask for the person's name, job title, and professional/social profile links, then repeat the research expectation line. Research facts only; profile facts require company co-mention. If a profile is auth-walled, use public web search fallback and still save the supplied profile URL as a source link when safe.
   - Do not ask long-form "describe your company" or "describe yourself" questions.
   - Do not infer goals, motivations, working preferences, or soft attributes during onboarding. Leave them sparse or as open questions for downstream skills.
   - Default to the simple Organization -> Person -> `default` GTM Workspace chain silently. If the user names a Business Unit or Team without being asked, include that deeper chain.

5. Build the GTM Setup Model before writing.
   - Resolve `$GTM_HOME` (default `~/.gtm`), registry path, Organization ID/path, Person ID/path, Workspace ID/path, optional Business Unit/Team IDs, timestamps, intended writes, and git actions.
   - Do not write local active state until the shared scaffold is valid enough to use.
   - Read [setup-and-repair.md](references/setup-and-repair.md) before writing or repairing files.

6. Confirm durable writes before execution.
   - Use a concise file/section preview, not a raw full diff by default.
   - State whether git will be initialized, whether an initial or repair commit will be created, and that no remote push, outreach, CRM update, or campaign action will happen.
   - Before the person confirmation pass, state that confirmed person facts will be committed to the Organization repo, which may be shared later; let the user trim or remove facts before writing.
   - If source links are provided or discovered, read [enrichment-and-safety.md](references/enrichment-and-safety.md), use `scripts/classify_source_links.py` when available to classify links, and write only confirmed facts and approved safe source labels.

7. Handle import before activation.
   - GitHub URL imports clone under `$GTM_HOME/<slug>`; if the path collides, append a readable numeric suffix.
   - Local path imports register the existing absolute path in place; do not copy it under `$GTM_HOME`.
   - Run the instruction trust gate and `gtm.yaml` structure gate from [setup-and-repair.md](references/setup-and-repair.md) before registering or activating.
   - Private-repo clone auth failures should point at the user's existing `gh` or SSH auth setup. Never handle credentials, never push, and preserve imported history/remotes.

8. Handle multiplayer mode only on explicit user intent.
   - Read [multiplayer.md](references/multiplayer.md) before publishing, joining, or syncing a shared project.
   - Joining a shared project is the import path.
   - Publishing creates a private GitHub repo by default and pushes only after explicit user confirmation.
   - Ongoing shared edits are session-batched through a self-merge PR flow.
   - Never push by default. The only sanctioned pushes are the confirmed initial publish push and the confirmed session-batched sync branch push inside multiplayer mode.

9. Write or repair deterministically.
   - Use the files in `templates/` for the scaffold: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and optional Business Unit/Team files.
   - Create `business-units/` and `teams/` directories even when they only contain `.gitkeep` placeholders.
   - Do not create skill-owned files such as `icps.md`, `personas.md`, or `scoring.md`.

10. Update local registry and git last.
   - Preserve unknown fields in `$GTM_HOME/registry.json` and project `gtm.yaml`.
   - Initialize git by default for new projects unless the user explicitly opts out.
   - Create `Initialize GTM context project` after successful new setup, or `Repair GTM context scaffold` after safe repair writes.
   - Never push outside the explicit multiplayer exceptions above. If git commit fails, keep written files and report the blocker.

11. End with the setup summary.
   - Include Organization ID/path, active Person and Workspace, files created/preserved/repaired, git status, enrichment status, omitted/redacted source counts, unresolved enrichment questions, import/publish status when relevant, and next recommended skills.
   - Recommend `gtm-define-icp` and `gtm-define-personas` for new projects.

## Context Resolution Contract

When resolving a GTM Context Project for setup, import, selection, repair, publish, or sync:

1. Use explicit user instruction in the prompt when the user names a GTM project, Organization ID, project path, workspace, or person.
2. If the current working directory is inside a GTM Context Repository, use the nearest ancestor containing `gtm.yaml`.
3. Otherwise use the active project in `$GTM_HOME/registry.json`.

After choosing the project, resolve the active Person and GTM Workspace from explicit prompt values, then registry local state, then the project's `default_workspace`. If no project resolves, say:

> I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

## Blocking Rules

- Missing Organization name, active Person display name, active Person role, or generated ID confirmation blocks creation.
- Missing or unresolved enrichment answers do not block setup; leave sparse sections or open questions.
- Unclear source-assisted claims that affect GTM decisions must not be written as facts until confirmed.
- Imported projects with divergent `AGENTS.md` or `CLAUDE.md` block activation until the user explicitly approves the nonstandard instruction text.
- Missing or broken `gtm.yaml` with no repair path blocks import; present a start-fresh option using the imported contents as source material.
- Existing human-authored files must not be overwritten unless the user explicitly asks to regenerate or replace them.

## Verification Checklist

- `gtm.yaml` has required fields, omits unknown optional fields, and references files that exist.
- `AGENTS.md` encodes the prompt -> CWD -> registry context-resolution order, and `CLAUDE.md` contains `@AGENTS.md`.
- Local active state is only in `$GTM_HOME/registry.json`, never in committed project files.
- `.gitignore` protects local state, secrets, temporary files, logs, `research/`, and `.tmp/` ephemeral job workspaces.
- Imports passed the instruction trust gate and parseable `gtm.yaml` structure gate before activation.
- The commit, if created, stages only the current setup or repair change set and never pushes.
- Multiplayer pushes happened only after explicit user confirmation, when that mode was requested.
- The final summary distinguishes created, preserved, repaired, skipped, and failed steps.

See [examples.md](references/examples.md) for a concrete Northstar Compliance setup shape.
