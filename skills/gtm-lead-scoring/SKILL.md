---
name: gtm-lead-scoring
description: Score lead relevance and outreach timing after lead segmentation. Use when the user asks to rank, prioritize, score, qualify, grade, or choose next actions for leads against personas, including one-off leads, CSVs, routing lists, research outputs, or outbound prioritization.
---

# GTM Lead Scoring

## Recipe

1. Resolve and echo `Working in <project>/<org-path>` from the prompt, current context repo, then `$GTM_HOME/state.json`.
2. Read the org chain, visible persona files, and governing `lead-scoring.md` files for the relevant org chains.
3. Accept a supplied `persona_label` only when it is `no-match` or exactly matches a visible qualified persona label; otherwise compose segmentation.
4. Resolve nearest scoring criteria from the persona org upward, or active-org criteria for `no-match`; preview missing criteria before any write.
5. Score each lead from 1-100, cap `no-match` at 49, and assign the exact fit band.
6. Return metadata, one-off or bulk scoring fields, provenance, open questions, and a side-effect statement.

## Details

- Default `$GTM_HOME` to `~/.gtm`; read state only from `$GTM_HOME/state.json`.
- Context resolution order is prompt, current directory inside a context repo, then active state; person is omitted unless explicitly named.
- If no context resolves, stop with: `I could not resolve a GTM context repo from this prompt, current directory, or local state. Run gtm-setup or tell me which GTM project to use.`
- Validate all ids and paths before reading or writing; reject absolute paths, `..`, separators in ids, non-kebab ids, and symlink escapes.
- If no visible persona files exist, stop and route to `gtm-define-personas`.
- Never invent persona labels; route new persona needs to `gtm-define-personas`.
- If no `persona_label` is supplied, compose `gtm-lead-segmentation` for the same input and score from its label, confidence, evidence, and open questions.
- For each lead with a persona label, start at that persona's org and walk up to root; the nearest `lead-scoring.md` governs that record.
- If no governing criteria exist, draft a concise `lead-scoring.md` proposal for the active org, preview it, and wait for confirmation.
- Write only `lead-scoring.md` at the confirmed org; do not edit personas, ICPs, account criteria, research files, CRM, outreach, exports, sync, or remotes.
- Score bands are exactly `1-49:not-a-fit`, `50-74:good-fit`, `75-89:great-fit`, and `90-100:excellent-fit`.
- `persona_label: no-match` always returns `not-a-fit` with `score <= 49`.
- Include evidence summary, positives, risks/disqualifiers, recommended action, confidence, `needs_review`, reasoning, provenance, and open questions.
- Set `needs_review` for low confidence, material ambiguity, private-source dependency, possible disqualifiers, unclear buying influence, or high scores backed by weak evidence.
- Metadata includes project, active org path, persona source, scoring source per record, prerequisites, and supplied or composed segmentation state.
- One-off output includes lead name, account name when known, `persona_label`, score, fit label, evidence summary, positives, risks, recommended action, confidence, review flag, reasoning, evidence, and open questions.
- Bulk output starts with fit distribution, low-confidence count, review-needed count, common risks, common open questions, then compact per-record fields.
- Malformed CSV/table input blocks bulk scoring until corrected.
- Normal output states that no CRM, outreach, export, sync, remote push, file write, or external side effect occurred unless scoring criteria were explicitly previewed, confirmed, and written.
