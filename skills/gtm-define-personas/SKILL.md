---
name: gtm-define-personas
description: Define or refine lead-level personas in the active GTM workspace. Use when the user mentions buyer roles, stakeholder roles, target contacts, titles, buying committees, lead fit criteria, objections, outreach hooks, no-match leads, or missing persona context for lead segmentation, scoring, or research.
---

# GTM Define Personas

Own `workspaces/<workspace-id>/personas.md`. Personas describe people
inside target accounts; ICPs remain in `icps.md`.

Treat `icps.md` as a hard prerequisite, not background color.

## Core Workflow

1. Resolve the GTM Context Project.
   - Default `$GTM_HOME` to `~/.gtm`.
   - Resolve project by prompt, current-directory `gtm.yaml`, then
     `$GTM_HOME/registry.json`.
   - Resolve person and workspace by prompt, registry active state, then
     `gtm.yaml`.
   - Validate resolved ids and paths before any read, write, stage, or commit:
     project, person, workspace, business-unit, and team ids must be lowercase
     slug ids; reject derived child paths that are absolute, contain `..`, or
     resolve outside the canonical project root, including symlink escapes.
   - Read `organization.md`, active person file, workspace `context.md`,
     `icps.md`, and existing `personas.md` when present.
   - Completion criterion: project path, workspace id, `icps.md`, and target
     `personas.md` are known, or a blocker is returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - Completion criterion: workspace context and ICP definitions are present, so personas can be grounded in account segments.

3. Determine create versus refine.
   - Create when `personas.md` is absent, empty, or only a placeholder.
   - Refine when the user asks to update, tighten, merge, split, add, remove, rename, or clarify existing personas.
   - Ask one focused question only when `context.md` and `icps.md` are too
     thin to draft one useful persona.
   - Completion criterion: the intended persona set, preserved content, unresolved questions, and any destructive scope are clear enough to preview.

4. Draft lead-level personas.
   - Each persona has a human name, stable lowercase machine label, relevant
     titles, responsibilities, pain or priority signals, buying influence,
     objections, disqualifiers, outreach-safe hooks, ICP relevance, source
     notes, confidence, `needs_review`, and open questions.
   - Include `no-match` for leads outside all defined personas.
   - When tightening `no-match` or persona disqualifier guidance, preserve the
     evidence boundary: missing or unclear role/system ownership facts become
     open questions, not automatic fit or `no-match` decisions.
   - Do not copy full ICP definitions, write scores, or create outreach drafts.
   - Completion criterion: every non-`no-match` persona is specific enough for
     lead segmentation and honest about uncertainty.

5. Preview before writing.
   - Show target file, sections created/updated/preserved/deleted, unresolved
     questions, sensitive-source handling, and proposed commit message.
   - State that no outreach, CRM update, campaign trigger, sync, remote push,
     or other external side effect will happen.
   - Wait for explicit confirmation before editing `personas.md`.

6. Write non-destructively and isolate git.
   - Preserve existing human-authored personas, notes, and unknown sections unless the user explicitly confirms a replacement or deletion.
   - Write only `workspaces/<workspace-id>/personas.md` for this skill action.
   - Stage only that file. Commit only when the change is confirmed and
     isolated. Never push.
   - If commit fails, keep the file and report that it remains uncommitted.

7. End with an execution summary.
   - Include project, workspace, target file, and hard prerequisites.
   - Report the source context files read, including organization context,
     active person context, workspace context, `icps.md`, and existing
     `personas.md` when present. Reviewers should not have to infer which
     context grounded the persona changes.
   - Report personas created, updated, preserved, removed, or marked `needs_review`.
   - Report changed file, commit hash or skip reason, and explicitly state
     that there was no remote push, outreach, CRM update, campaign trigger,
     sync, or external side effect.
   - Recommend downstream lead segmentation, lead research, or lead scoring only when the requested persona work is complete.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-define-personas`.

- If there is not enough context to draft at least one persona after reading workspace context and ICPs, ask one focused question with a recommended answer when possible.
- Do not write unresolved conflicts as facts. Save them as open questions or mark the affected persona `needs_review: true`.
