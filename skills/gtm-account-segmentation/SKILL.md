---
name: gtm-account-segmentation
description: Segment accounts into visible org-qualified ICP labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify accounts against ICPs, including one-off accounts, pasted tables, CSV files, routing lists, or account inputs for scoring and research.
---

# GTM Account Segmentation

Classify each account into exactly one visible ICP label or `no-match`. Normal
output is ephemeral and does not write context files.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Person is not needed; omit it unless explicitly named.
   - Echo: `Working in <project>/<org-path>`.
   - Read the `org.md` chain and visible ICP files. For a subtree request, also
     read ICPs below the active org.

2. Enforce prerequisites.
   - If no visible ICP files exist for the requested scope, stop and route to
     `gtm-define-icp`.
   - Validate all ids and paths before reading. Reject absolute paths, `..`,
     non-kebab ids, and symlink escapes.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single account described in the prompt or selected
     record.
   - Use bulk mode for CSV files, markdown tables, pasted tables, or CRM/export
     files the user provides.
   - Normalize account name, website, industry, size, region, summary, signals,
     known gaps, evidence labels, and open questions.
   - Ask one focused clarification only when account identity or core evidence
     is missing; otherwise proceed with explicit uncertainty.

4. Assign the label.
   - Compare account evidence to inherited and local ICP files, their
     disqualifiers, and org constraints.
   - Labels must be qualified by org path: `enterprise` at root,
     `cloud/emea/enterprise` in a child org.
   - When inherited and local ICP stems collide, use the nearest file to the org
     being evaluated.
   - Use `no-match` when evidence is insufficient for every visible ICP, a
     stronger disqualifier applies, or the account sits outside the requested
     org scope.
   - Never invent labels. If a new ICP is needed, route to `gtm-define-icp`.
   - Set confidence from evidence quality, freshness, directness, gaps, and
     conflicts. Set `needs_review` for low confidence, material ambiguity,
     private-source dependency, or possible disqualifiers.

5. Return the result.
   - Include project, org path, ICP files read, hard prerequisites, and whether
     this was one-off or bulk.
   - For one-off mode, return account name, `segment_label`, ICP display name,
     confidence, `needs_review`, reasoning, evidence, and open questions.
   - For bulk mode, start with counts by label, low-confidence count,
     review-needed count, common evidence patterns, and common open questions;
     then return compact per-record fields.
   - State that no CRM update, file write, outreach, export, sync, or external
     side effect occurred. Preview and confirm before any user-requested export
     or external update.

## Blocking Rules

- If no context resolves, stop with: `I could not resolve a GTM context repo
  from this prompt, current directory, or local state. Run gtm-setup or tell me
  which GTM project to use.`
- If no visible ICP files exist, stop with: `I found the GTM context repo and
  org, but this scope has no usable ICP files. Run gtm-define-icp first, then
  rerun gtm-account-segmentation.`
- Malformed CSV/table input blocks bulk segmentation until corrected.
- Do not silently create or rename ICP labels.
