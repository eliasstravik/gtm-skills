---
name: gtm-define-icp
description: Define or refine account-level ICP segments in the active GTM workspace. Use when the user mentions ideal customers, target accounts, account fit criteria, disqualifiers, target markets, no-match accounts, or missing ICP context for account segmentation, scoring, or research.
---

# GTM Define ICP

Own `workspaces/<workspace-id>/icps.md`. This file describes
account-level segments only: company fit, buying context, triggers,
disqualifiers, and `no-match` guidance.

## Core Workflow

1. Resolve the GTM Context Project.
   - Default `$GTM_HOME` to `~/.gtm`.
   - Resolve project by prompt, current-directory `gtm.yaml`, then
     `$GTM_HOME/registry.json`.
   - Resolve active person and workspace by prompt, registry active state, then
     `gtm.yaml`.
   - Validate resolved ids and paths before any read, write, stage, or commit:
     project, person, workspace, business-unit, and team ids must be lowercase
     slug ids; reject derived child paths that are absolute, contain `..`, or
     resolve outside the canonical project root, including symlink escapes.
   - Read `organization.md`, active person file,
     `workspaces/<workspace-id>/context.md`, and existing `icps.md` when
     present.
   - Completion criterion: project path, workspace id, and target `icps.md`
     path are known, or the missing-context blocker is returned.

2. Determine create versus refine.
   - Create when `icps.md` is absent, empty, or only a placeholder.
   - Refine when user asks to update, tighten, merge, split, add, remove, or clarify existing account segments.
   - Ask one focused question only when workspace context is too thin to draft
     at least one useful segment.
   - Completion criterion: the intended segment set, preserved content, and unresolved questions are clear enough to draft a preview.

3. Draft account segments.
   - Each segment has a human name, stable lowercase machine label, best-fit
     account description, strong signals, disqualifiers, source notes,
     confidence, `needs_review`, and open questions.
   - Include a `no-match` section. `no-match` is the only label downstream
     account skills may use for accounts outside every defined ICP.
   - Mark sparse, inferred, or conflicting definitions with
     `needs_review: true`.
   - When tightening `no-match` or disqualifier guidance, preserve the
     evidence boundary: missing or unclear facts become open questions, not
     automatic fit or `no-match` decisions.
   - Do not write personas, scores, lead titles, outreach drafts, or one-off
     research into `icps.md`.

4. Preview before writing.
   - Show target file, sections created/updated/preserved/deleted, unresolved
     questions, sensitive-source handling, and proposed commit message.
   - State that no outreach, CRM update, campaign trigger, sync, or remote push
     will happen.
   - Wait for explicit confirmation before editing `icps.md`.

5. Write non-destructively and isolate git.
   - Preserve existing human-authored segments, notes, and unknown sections unless the user explicitly confirms a replacement or deletion.
   - Write only `workspaces/<workspace-id>/icps.md` for this skill action.
   - Stage only that file. Commit only when the change is confirmed and
     isolated. Never push.
   - If commit fails, keep the file and report that it remains uncommitted.

6. End with an execution summary.
   - Include project, workspace, target file, and hard prerequisites.
   - Report the source context files read, including organization context,
     active person context, workspace context, and existing `icps.md` when
     present. Reviewers should not have to infer which context grounded the
     segment changes.
   - Report segments created, updated, preserved, removed, or marked `needs_review`.
   - Report changed file, commit hash or skip reason, and explicitly state
     that there was no remote push, outreach, CRM update, campaign trigger,
     sync, or external side effect.
   - Recommend `gtm-define-personas` next when personas are missing.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
- If there is not enough context to draft at least one segment, ask one focused question with a recommended answer when possible.
- Do not write unresolved conflicts as facts. Save them as open questions or mark the affected segment `needs_review: true`.
