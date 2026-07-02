---
name: gtm-define-personas
description: Define, create, or refine buyer and lead personas in the active GTM Workspace by writing or updating the workspace personas.md file. Use when a user mentions personas, buyer roles, stakeholder roles, target contacts, titles, buying committees, lead fit criteria, objections, outreach hooks, no-match leads, or needs persona context before GTM lead segmentation, lead research, or lead scoring.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context, icps]
  composes: []
  output_mode: durable
  supports: [one-off]
---

# GTM Define Personas

Create or refine lead-level Persona segments for the active GTM Workspace. This skill owns `workspaces/<workspace-id>/personas.md`; do not put ICP definitions, scoring models, research briefs, or outreach drafts in this file.

Personas describe the ideal people inside the defined ICP accounts. Treat `icps.md` as a hard prerequisite, not background color.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, `workspaces/<workspace-id>/icps.md`, and existing `workspaces/<workspace-id>/personas.md` when present.
   - Completion criterion: the project path, active workspace, target `personas.md` path, and source `icps.md` path are known, or a blocking failure below has been returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - Completion criterion: workspace context and ICP definitions are present, so personas can be grounded in account segments.

3. Determine create versus refine.
   - Create when `personas.md` is absent, empty, or only a placeholder.
   - Refine when the user asks to update, tighten, merge, split, add, remove, rename, or clarify existing personas.
   - Ask only for missing buyer context needed to draft at least one useful persona. Prefer a recommended default from `context.md` and `icps.md` over an open-ended question.
   - Completion criterion: the intended persona set, preserved content, unresolved questions, and any destructive scope are clear enough to preview.

4. Draft lead-level personas.
   - Define people inside ICP accounts: role, seniority, department, responsibilities, pains, priorities, buying influence, objections, language, and outreach hooks.
   - Give every persona a stable lowercase machine label. Include `no-match` for leads that do not match any defined persona.
   - Tie personas back to the relevant ICP segments without copying full ICP definitions into `personas.md`.
   - Include confidence, reasoning, `needs_review`, provenance/source notes, and open questions when the definition rests on sparse, conflicting, or inferred context.
   - Read [persona-examples.md](references/persona-examples.md) when drafting a new file, updating existing personas, or needing the Northstar Compliance example shape.
   - Completion criterion: each non-`no-match` persona has titles, responsibilities, pain/priority signals, objections or disqualifiers, outreach hooks, ICP relevance, provenance/source notes, confidence, reasoning, `needs_review`, and open questions.

5. Preview before writing.
   - Show a Durable Context Write Preview with target file, sections to create/update/preserve/delete, conflicts or unresolved questions, sensitive-source handling, and whether unrelated working-tree changes will be left alone.
   - State whether a git commit will be created and show the proposed message, usually `Create persona definitions` or `Update persona definitions`.
   - State that no outreach, CRM update, campaign trigger, sync, remote push, or other external side effect will happen.
   - Show a raw diff only when the user asks, the change is small, conflict-heavy, unusually sensitive, destructive, or the summary is not enough.
   - Wait for explicit confirmation before editing `personas.md`.

6. Write non-destructively and isolate git.
   - Preserve existing human-authored personas, notes, and unknown sections unless the user explicitly confirms a replacement or deletion.
   - Write only `workspaces/<workspace-id>/personas.md` for this skill action.
   - Auto-commit only commit-safe, confirmed, isolated changes. Stage the target file explicitly; never use `git add .`.
   - Leave unrelated pre-existing working-tree changes uncommitted. If the target file or target sections had pre-existing uncommitted edits and isolation is unclear, write the confirmed change but skip auto-commit.
   - If git commit fails after a successful write, do not roll back the file; report that changes remain uncommitted.
   - Never push by default.

7. End with an execution summary.
   - Include the dependency trace: project, workspace, hard prerequisites, and skipped composed skills.
   - Report personas created, updated, preserved, removed, or marked `needs_review`.
   - Report changed files, commit status/hash or commit skip/failure reason, unrelated changes left alone, and that no push or external side effects occurred.
   - Recommend downstream lead segmentation, lead research, or lead scoring only when the requested persona work is complete.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-define-personas`.

- If there is not enough context to draft at least one persona after reading workspace context and ICPs, ask one focused question with a recommended answer when possible.
- Do not write unresolved conflicts as facts. Save them as open questions or mark the affected persona `needs_review: true`.

## Verification Checklist

- `workspaces/<workspace-id>/personas.md` exists after confirmed creation and contains lead-level personas plus `no-match`.
- `workspaces/<workspace-id>/icps.md` was read first and remains unchanged by this skill action.
- Existing persona content is preserved unless replacement was explicitly confirmed.
- Persona labels are stable lowercase kebab-case and unique.
- Durable preview and execution summary name file/section scope, commit behavior, no-push status, and no external side effects.
- Auto-commit stages only the confirmed persona file, skips unclear target-file overlap, and never pushes.
