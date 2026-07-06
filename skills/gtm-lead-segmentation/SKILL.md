---
name: gtm-lead-segmentation
description: Segment leads and contacts into the active GTM workspace persona labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify people against personas, including one-off leads, pasted tables, CSV files, contact lists, or inputs for lead scoring and research.
---

# GTM Lead Segmentation

Classify each lead or contact into exactly one label from workspace
`personas.md`, or `no-match`. Normal output is ephemeral.

## Core Workflow

1. Resolve the GTM Context Project.
   - Default `$GTM_HOME` to `~/.gtm`.
   - Resolve project by prompt, current-directory `gtm.yaml`, then
     `$GTM_HOME/registry.json`.
   - Resolve workspace by prompt, registry active state, then `gtm.yaml`.
   - Validate resolved ids and paths before any read or output step: project,
     workspace, business-unit, and team ids must be lowercase slug ids; reject
     derived child paths that are absolute, contain `..`, or resolve outside the
     canonical project root, including symlink escapes.
   - Read `organization.md`, workspace `context.md`, and `personas.md`.
   - Completion criterion: project path, workspace id, persona source path,
     and lead input source are known, or a blocker is returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/personas.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-personas`.
   - Completion criterion: lead segmentation is grounded in usable workspace context and persona definitions.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single lead described in the prompt or one selected record.
   - Use bulk mode for CSV files, simple markdown tables, pasted tables, or CRM/spreadsheet exports provided as files.
   - Normalize available fields such as lead id, account id, account name, lead name, title, department, seniority, region, persona signal, account segment, known gaps, evidence labels, and open questions.
   - Ask one focused clarification only when the person identity or core role evidence is missing; otherwise segment with explicit uncertainty.
   - Completion criterion: each lead record has enough normalized evidence to compare against the persona definitions or return `no-match`.

4. Assign the persona.
   - Compare the lead evidence to the active workspace's persona titles, responsibilities, pains, outreach hooks, disqualifiers, and `no-match` guidance.
   - Assign one machine-readable `persona_label` from `personas.md`; never invent a new label inside segmentation output.
   - Use `no-match` when the lead lacks evidence for all defined personas, sits outside the workspace's relevant buying committee, or is attached to a known non-fit account without a special user-supplied reason.
   - Preserve evidence boundaries: do not infer persona fit from seniority, a generic operations/IT title, or a plausible account alone when `personas.md` requires role ownership, systems responsibility, buying influence, or disqualifier checks.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, and conflicts.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, unclear buying authority, interim/consulting status, or a possible disqualifier.
   - Completion criterion: every lead has a persona label, confidence, reasoning, review flag, source provenance, and open questions.

5. Return the result.
   - Include project, workspace, persona source path, hard prerequisites, and
     the source context files read (`organization.md`, workspace `context.md`,
     and `personas.md`).
   - For one-off mode, return lead name, account name when known, persona
     label, persona name, confidence, review flag, reasoning, evidence, and
     open questions.
   - For bulk mode, start with counts by persona, low-confidence count,
     review-needed count, common evidence patterns, and open questions; then
     return compact per-record fields.
   - State that no side effects occurred, including no CRM updates,
     file/context writes, outreach, exports, syncs, campaign actions, or
     external calls. Preview and confirm before export, save, sync, CRM update,
     outreach, campaign action, or context write.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `personas.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/personas.md`. Run `gtm-define-personas` first, then rerun `gtm-lead-segmentation`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- Do not silently create new persona labels. If the user wants a new persona, route them to `gtm-define-personas`.
