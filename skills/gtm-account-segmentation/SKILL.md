---
name: gtm-account-segmentation
description: Segment accounts into the active GTM workspace ICP labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify accounts against ICPs, including one-off accounts, pasted tables, CSV files, routing lists, or account inputs for scoring and research.
---

# GTM Account Segmentation

Classify each account into exactly one label from workspace `icps.md`, or
`no-match`. Normal output is ephemeral.

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
   - Read `organization.md`, workspace `context.md`, and `icps.md`.
   - Completion criterion: project path, workspace id, ICP source path, and
     account input source are known, or a blocker is returned.

2. Enforce hard prerequisites.
   - If no GTM Context Project resolves, stop with the exact missing-context failure in Blocking Rules.
   - If a project resolves but no active or default workspace can be determined, ask the user to choose a workspace or run `gtm-setup` repair.
   - If `workspaces/<workspace-id>/icps.md` is missing, empty, or placeholder-only, stop and route the user to `gtm-define-icp`.
   - Completion criterion: account segmentation is grounded in usable workspace context and ICP definitions.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single account described in the prompt or one selected record.
   - Use bulk mode for CSV files, simple markdown tables, pasted tables, or CRM/spreadsheet exports provided as files.
   - Normalize available fields such as account name, website, industry, employee count, region, summary, signals, known gaps, evidence labels, and open questions.
   - Ask one focused clarification only when the account identity or core evidence is missing; otherwise segment with explicit uncertainty.
   - Completion criterion: each account record has enough normalized evidence to compare against the ICP definitions or return `no-match`.

4. Assign the segment.
   - Compare the account evidence to the active workspace's ICP criteria, signals, disqualifiers, and `no-match` guidance.
   - Assign one machine-readable `segment_label` from `icps.md`; never invent a new label inside segmentation output.
   - Use `no-match` when the account lacks evidence for all defined ICPs, matches a disqualifier more strongly than any ICP, or the user-provided account is outside the workspace market.
   - Preserve evidence boundaries: do not infer fit from company size, industry, or a plausible pain point alone when `icps.md` requires more specific buying signals, operating context, or disqualifier checks.
   - Set `confidence` to `low`, `medium`, or `high` based on evidence quality, freshness, directness, gaps, and conflicts.
   - Set `needs_review: true` for every new low-confidence result and for medium/high-confidence results with material ambiguity, conflicts, sensitive/private-source dependency, or a possible disqualifier.
   - Completion criterion: every account has a segment label, confidence, reasoning, review flag, source provenance, and open questions.

5. Return the result.
   - Include project, workspace, ICP source path, and the source context files read (`organization.md`, workspace `context.md`, and `icps.md`).
   - Include hard prerequisites and state whether each prerequisite was satisfied, blocked, or skipped because an earlier prerequisite failed.
   - For one-off mode, return `account_name`, `segment_label`,
     `segment_name`, `confidence`, `needs_review`, `reasoning`, `evidence`,
     and `open_questions`.
   - For bulk mode, start with counts by segment, low-confidence count,
     review-needed count, common evidence patterns, and common open questions;
     then return a compact table with account id/name, segment label,
     confidence, review flag, reasoning, top evidence, and open questions.
   - State that no side effects occurred, including no CRM updates, file/context writes, outreach, exports, syncs, or external calls. If the user asks to export, save, sync, update CRM, trigger outreach, or write context, show a preview and wait for confirmation.

## Blocking Rules

- If no GTM Context Project resolves, stop with exactly:

  > I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

- If the active workspace has no usable `icps.md`, stop with:

  > I found a GTM Context Project and active workspace, but this workspace has no usable `workspaces/<workspace-id>/icps.md`. Run `gtm-define-icp` first, then rerun `gtm-account-segmentation`.

- If the input is a malformed CSV/table file, explain the parsing problem and ask for a corrected file or pasted table.
- Do not silently create new ICP labels. If the user wants a new segment, route them to `gtm-define-icp`.
