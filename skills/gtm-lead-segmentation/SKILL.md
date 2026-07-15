---
name: gtm-lead-segmentation
description: Segment leads and contacts into visible org-qualified persona labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify people against personas, including one-off leads, pasted tables, CSV files, contact lists, or inputs for lead scoring and research.
---

# GTM Lead Segmentation

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` from the prompt, current context repo, then `$GTM_HOME/state.json`.
2. Read the root-to-active `org.md` chain and every visible persona file, including descendant personas only for an explicit subtree request.
3. Reject unresolved context, missing visible personas, unsafe ids, path escapes, malformed tables, and label-creation requests before classifying.
4. Normalize one lead or a bulk table into lead id, account, name, title, function, seniority, region, persona signal, account segment, gaps, evidence labels, and open questions.
5. Assign exactly one visible qualified persona label or `no-match` using nearest-file precedence for inherited/local stem collisions.
6. Return metadata, required one-off or bulk fields, confidence, review flag, reasoning, evidence, open questions, and a no-side-effects statement.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Context resolution order is prompt, current directory inside a context repo, then active state; person is omitted unless explicitly named.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- If no visible persona files exist, stop with: `I found the GTM context repo and org, but this scope has no usable persona files. Run gtm-define-personas first, then rerun gtm-lead-segmentation.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- Use one-off mode for a single lead; use bulk mode for CSV files, markdown tables, pasted tables, CRM/export files, contact lists, or routing inputs.
- Ask one focused clarification only when person identity or core role evidence is missing; otherwise proceed with explicit uncertainty.
- Qualified labels are `economic-buyer` at root and `<org-path>/revops-lead` in a child org such as `cloud/emea/revops-lead`.
- When inherited and local persona stems collide, use the nearest persona file to the evaluated org.
- Compare evidence against persona disqualifiers and org constraints; use `no-match` when evidence is insufficient, the lead is outside scope, or a stronger disqualifier applies.
- Never invent, create, rename, or silently broaden persona labels; route new persona needs to `gtm-define-personas`.
- Set confidence from evidence quality, freshness, directness, gaps, and conflicts.
- Set `needs_review` for low confidence, material ambiguity, private-source dependency, unclear buying influence, or possible disqualifiers.
- Metadata includes project, org path, persona files read, prerequisites, and one-off or bulk mode.
- One-off output includes lead name, account name when known, `persona_label`, persona display name, confidence, review flag, reasoning, evidence, and open questions.
- Bulk output starts with counts by label, low-confidence count, review-needed count, common evidence patterns, common open questions, then compact per-record fields.
- Normal output writes nothing and performs no CRM update, file write, outreach, export, sync, remote push, or other external side effect.
- Preview and wait for explicit confirmation before any user-requested export or external update.
