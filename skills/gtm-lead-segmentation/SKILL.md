---
name: gtm-lead-segmentation
description: Segment leads and contacts into visible org-qualified persona labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify people against personas, including one-off leads, pasted tables, CSV files, contact lists, or inputs for lead scoring and research.
---

# GTM Lead Segmentation

Classify each lead or contact into exactly one visible persona label or
`no-match`. Normal output is ephemeral and does not write context files.

## Core Workflow

1. Resolve and echo context.
   - Default `$GTM_HOME` to `~/.gtm`; read local state from
     `$GTM_HOME/state.json`.
   - Resolve project by prompt, current directory inside a context repo, then
     active state. Resolve org by prompt, state pin, then root.
   - Person is not needed; omit it unless explicitly named.
   - Echo: `Working in <project>/<org-path>`.
   - Read the `org.md` chain and visible persona files. For a subtree request,
     also read personas below the active org.

2. Enforce prerequisites.
   - If no visible persona files exist for the requested scope, stop and route
     to `gtm-define-personas`.
   - Validate all ids and paths before reading. Reject absolute paths, `..`,
     non-kebab ids, and symlink escapes.

3. Choose one-off or bulk mode.
   - Use one-off mode for a single lead described in the prompt or selected
     record.
   - Use bulk mode for CSV files, markdown tables, pasted tables, or CRM/export
     files the user provides.
   - Normalize lead id, account id/name, lead name, title, function, seniority,
     region, persona signal, account segment, known gaps, evidence labels, and
     open questions.
   - Ask one focused clarification only when person identity or core role
     evidence is missing; otherwise proceed with explicit uncertainty.

4. Assign the label.
   - Compare lead evidence to inherited and local persona files, their
     disqualifiers, and org constraints.
   - Labels must be qualified by org path: `economic-buyer` at root,
     `cloud/emea/revops-lead` in a child org.
   - When inherited and local persona stems collide, use the nearest file to
     the org being evaluated.
   - Use `no-match` when evidence is insufficient for every visible persona,
     the lead sits outside the buying committee for the requested scope, or a
     stronger disqualifier applies.
   - Never invent labels. If a new persona is needed, route to
     `gtm-define-personas`.
   - Set confidence from evidence quality, freshness, directness, gaps, and
     conflicts. Set `needs_review` for low confidence, material ambiguity,
     private-source dependency, unclear buying influence, or possible
     disqualifiers.

5. Return the result.
   - Include project, org path, persona files read, hard prerequisites, and
     whether this was one-off or bulk.
   - For one-off mode, return lead name, account name when known,
     `persona_label`, persona display name, confidence, review flag, reasoning,
     evidence, and open questions.
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
- If no visible persona files exist, stop with: `I found the GTM context repo
  and org, but this scope has no usable persona files. Run gtm-define-personas
  first, then rerun gtm-lead-segmentation.`
- Malformed CSV/table input blocks bulk segmentation until corrected.
- Do not silently create or rename persona labels.
