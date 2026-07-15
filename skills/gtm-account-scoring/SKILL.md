---
name: gtm-account-scoring
description: Score account fit and timing after account segmentation. Use when the user asks to rank, prioritize, score, qualify, grade, or choose next actions for accounts against ICPs, including one-off accounts, CSVs, routing lists, research outputs, or outbound prioritization.
---

# GTM Account Scoring

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` from the prompt, current context repo, then `$GTM_HOME/state.json`.
2. Read the org chain, visible ICP files, and governing `account-scoring.md` files for the relevant org chains.
3. Accept a supplied `segment_label` only when it is `no-match` or exactly matches a visible qualified ICP label; otherwise compose segmentation.
4. Resolve nearest scoring criteria from the ICP org upward, or active-org criteria for `no-match`; preview missing criteria before any write.
5. Score each account from 1-100, cap `no-match` at 49, and assign the exact fit band.
6. Return metadata, one-off or bulk scoring fields, provenance, open questions, and a side-effect statement.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Context resolution order is prompt, current directory inside a context repo, then active state; person is omitted unless explicitly named.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- Validate all ids and paths before reading or writing; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- If no visible ICP files exist, stop and route to `gtm-define-icp`.
- Never invent ICP labels; route new targeting needs to `gtm-define-icp`.
- If no `segment_label` is supplied, compose `gtm-account-segmentation` for the same input and score from its label, confidence, evidence, and open questions.
- For each account with an ICP label, start at that ICP's org and walk up to root; the nearest `account-scoring.md` governs that record.
- If no governing criteria exist, draft a concise `account-scoring.md` proposal for the active org, preview it, and wait for confirmation.
- Write only `account-scoring.md` at the confirmed org; do not edit ICPs, personas, lead criteria, research files, CRM, outreach, exports, sync, or remotes.
- Score bands are exactly `1-49:not-a-fit`, `50-74:good-fit`, `75-89:great-fit`, and `90-100:excellent-fit`.
- `segment_label: no-match` always returns `not-a-fit` with `score <= 49`.
- Include evidence summary, positives, risks/disqualifiers, recommended action, confidence, `needs_review`, reasoning, provenance, and open questions.
- Set `needs_review` for low confidence, material ambiguity, private-source dependency, possible disqualifiers, or high scores backed by weak evidence.
- Metadata includes project, active org path, segment source, scoring source per record, prerequisites, and supplied or composed segmentation state.
- One-off output includes account name, `segment_label`, score, fit label, evidence summary, positives, risks/disqualifiers, recommended action, confidence, review flag, reasoning, evidence, and open questions.
- Bulk output starts with fit distribution, low-confidence count, review-needed count, common risks, common open questions, then compact per-record fields.
- Malformed CSV/table input blocks bulk scoring until corrected.
- Normal output states that no CRM, outreach, export, sync, remote push, file write, or external side effect occurred unless scoring criteria were explicitly previewed, confirmed, and written.
