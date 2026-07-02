---
name: gtm-define-icp
description: Define, create, or refine Ideal Customer Profile account segments in the active GTM Workspace by writing or updating the workspace icps.md file. Use when a user mentions ICPs, ideal customers, target account segments, account fit criteria, disqualifiers, target markets, no-match accounts, or needs ICP context before GTM account segmentation, account research, or account scoring.
metadata:
  function_tags: [sales, marketing, revops, growth]
  role_tags: [sdr, bdr, ae, full-cycle-seller, sales-ops, marketing-ops, cro, vp-sales, founder]
  requires_context: [context]
  composes: []
  output_mode: durable
  supports: [one-off]
---

# GTM Define ICP

Create or refine account-level Ideal Customer Profile segments for the active GTM Workspace. This skill owns `workspaces/<workspace-id>/icps.md`; do not put personas, scoring models, or one-off research briefs in this file.

## Core Workflow

1. Resolve the GTM Context Project.
   - Use explicit prompt context first, then the nearest current-directory ancestor containing `gtm.yaml`, then `$GTM_HOME/registry.json`; default `$GTM_HOME` to `~/.gtm`.
   - Resolve the active Person and GTM Workspace from the prompt, registry local state, then `gtm.yaml` `default_workspace`.
   - Read `organization.md`, `people/<person-id>.md`, `workspaces/<workspace-id>/context.md`, and existing `workspaces/<workspace-id>/icps.md` when present.
   - Completion criterion: the project path, active workspace, and target `icps.md` path are known, or the missing-context failure below has been returned.

2. Determine create versus refine.
   - Create when `icps.md` is absent, empty, or only a placeholder.
   - Refine when user asks to update, tighten, merge, split, add, remove, or clarify existing account segments.
   - Ask only for missing business context needed to draft at least one useful account segment. Prefer a recommended default from the existing workspace context over an open-ended question.
   - Completion criterion: the intended segment set, preserved content, and unresolved questions are clear enough to draft a preview.

3. Draft account segments.
   - Define account-level segments only: firmographics, technographics, situational triggers, workflow pain, buying context, and disqualifiers.
   - Give every segment a stable lowercase machine label. Include a `no-match` segment for accounts that do not match any ICP.
   - Keep user-approved evidence auditable with provenance/source notes, but do not save secret-bearing URLs, tokenized links, local paths, or unapproved private sources.
   - Include confidence, reasoning, `needs_review`, and open questions when the definition rests on sparse, conflicting, or inferred context.
   - Read [icp-examples.md](references/icp-examples.md) when drafting a new file, updating existing segments, or needing the Northstar Compliance example shape.

4. Preview before writing.
   - Show a Durable Context Write Preview with target file, sections to create/update/preserve/delete, conflicts or unresolved questions, and sensitive-source handling.
   - State whether a git commit will be created and show the proposed message, usually `Create ICP definitions` or `Update ICP definitions`.
   - State that no outreach, CRM update, campaign trigger, sync, or remote push will happen.
   - Show a raw diff only when the user asks, the change is small, conflict-heavy, unusually sensitive, destructive, or the summary is not enough.
   - Wait for explicit confirmation before editing `icps.md`.

5. Write non-destructively and isolate git.
   - Preserve existing human-authored segments, notes, and unknown sections unless the user explicitly confirms a replacement or deletion.
   - Write only `workspaces/<workspace-id>/icps.md` for this skill action.
   - Auto-commit only commit-safe, confirmed, isolated changes. Stage the target file explicitly; never use `git add .`.
   - Leave unrelated pre-existing working-tree changes uncommitted. If the target file or target sections had pre-existing uncommitted edits and isolation is unclear, write the confirmed change but skip auto-commit.
   - If git commit fails after a successful write, do not roll back the file; report that changes remain uncommitted.
   - Never push by default.

6. End with an execution summary.
   - Include the dependency trace: project, workspace, target file, hard prerequisites, and skipped composed skills.
   - Report segments created, updated, preserved, removed, or marked `needs_review`.
   - Report changed files, commit status/hash or commit skip/failure reason, unrelated changes left alone, and that no push or external side effects occurred.
   - Recommend `gtm-define-personas` next when personas are missing.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
- If there is not enough context to draft at least one segment, ask one focused question with a recommended answer when possible.
- Do not write unresolved conflicts as facts. Save them as open questions or mark the affected segment `needs_review: true`.

## Verification Checklist

- `workspaces/<workspace-id>/icps.md` exists after confirmed creation and contains account-level ICP definitions plus `no-match`.
- Existing ICP content is preserved unless replacement was explicitly confirmed.
- Segment labels are stable lowercase kebab-case and unique.
- Durable preview and execution summary name file/section scope, commit behavior, and no-push/no-external-side-effect status.
- Auto-commit stages only the confirmed ICP file, skips unclear target-file overlap, and never pushes.
