---
name: gtm-account-segmentation
description: Segment accounts into visible org-qualified ICP labels or no-match. Use when the user asks to classify, segment, bucket, route, or qualify accounts against ICPs, including one-off accounts, pasted tables, CSV files, routing lists, or account inputs for scoring and research.
---

# GTM Account Segmentation

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` from the prompt, current context repo, then `$GTM_HOME/state.json`.
2. Read the root-to-active `org.md` chain and every visible ICP file, including descendant ICPs only for an explicit subtree request.
3. Reject unresolved context, missing visible ICPs, unsafe ids, path escapes, malformed tables, and label-creation requests before classifying.
4. Normalize one account or a bulk table into account name, website, industry, size, region, summary, signals, gaps, evidence labels, and open questions.
5. Assign exactly one visible qualified ICP label or `no-match` using nearest-file precedence for inherited/local stem collisions.
6. Return metadata, required one-off or bulk fields, confidence, review flag, reasoning, evidence, open questions, and a no-side-effects statement.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Context resolution order is prompt, current directory inside a context repo, then active state; person is omitted unless explicitly named.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- If no visible ICP files exist, stop with: `I found the GTM context repo and org, but this scope has no usable ICP files. Run gtm-define-icp first, then rerun gtm-account-segmentation.`
- Validate all ids and paths before reading; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- Use one-off mode for a single account; use bulk mode for CSV files, markdown tables, pasted tables, CRM/export files, or routing lists.
- Ask one focused clarification only when account identity or core evidence is missing; otherwise proceed with explicit uncertainty.
- Qualified labels are `enterprise` at root and `<org-path>/enterprise` in a child org such as `cloud/emea/enterprise`.
- When inherited and local ICP stems collide, use the nearest ICP file to the evaluated org.
- Use `no-match` when evidence is insufficient for every visible ICP, a stronger disqualifier applies, or the account is outside scope.
- Never invent, create, rename, or silently broaden ICP labels; route new targeting needs to `gtm-define-icp`.
- Set confidence from evidence quality, freshness, directness, gaps, and conflicts.
- Set `needs_review` for low confidence, material ambiguity, private-source dependency, or possible disqualifiers.
- Metadata includes project, org path, ICP files read, prerequisites, and one-off or bulk mode.
- One-off output includes account name, `segment_label`, ICP display name, confidence, `needs_review`, reasoning, evidence, and open questions.
- Bulk output starts with counts by label, low-confidence count, review-needed count, common evidence patterns, common open questions, then compact per-record fields.
- Normal output writes nothing and performs no CRM update, outreach, export, sync, remote push, file write, or other external side effect.
- Preview and wait for explicit confirmation before any user-requested export or external update.
