# ADR 0055: Bulk outputs include a run-level summary

## Status

Accepted

## Context

ADR 0005 requires research, scoring, and segmentation skills to support bulk mode. ADR 0077 scopes MVP bulk input support to CSV/table-file sources. ADR 0054 says bulk outputs should carry compact per-record provenance by default.

Per-record provenance is necessary for auditing individual rows, but it is not enough for users deciding what to do with the whole batch. A bulk run also needs an aggregate view of volume, fit distribution, confidence, open questions, review needs, and common evidence patterns.

## Decision

Every bulk research, scoring, and segmentation run should include a concise run-level summary in addition to per-record outputs.

Example:

```md
## Bulk run summary

Records processed: 250
Great-fit: 31
Good-fit: 84
Not-a-fit: 135
Low-confidence records: 22
Records with open questions: 17
Records needing human review: 9

Top evidence patterns:
- Compliance hiring
- Similar customer case study
- ICP industry match

Common open questions:
- Company size unclear
- Region/market unclear
- Buyer persona not identifiable
```

Rules:

1. Include a run-level summary for every bulk run, even when the main output is a CSV/table.
2. Include record counts and useful distribution counts for the run type.
3. For scoring runs, summarize fit bands such as `excellent-fit`, `great-fit`, `good-fit`, and `not-a-fit`.
4. For segmentation runs, summarize segment counts, `no-match` counts, and records needing review.
5. For research runs, summarize notable signal patterns, missing-context patterns, and records needing follow-up.
6. Include counts for low-confidence records, records with open questions, and records where `needs_review: true` when applicable.
7. Include top evidence patterns and common open questions when they help users prioritize the batch.
8. Keep the summary concise enough to scan quickly.
9. Do not expose sensitive URLs, tokens, invite links, signed URLs, or private source details in the run-level summary.
10. Bulk run summaries remain ephemeral by default unless the user explicitly promotes a durable learning.

ADR 0056 defines the per-record `confidence`, `reasoning`, and `needs_review` fields that feed low-confidence and review counts in the run-level summary.

ADR 0057 defines that review explanation belongs in per-record `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new low-confidence records are included in records needing review because new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that records needing review should be blocked from automated downstream actions by default.

ADR 0060 defines that human review can later clear the gate by updating `needs_review` and `reasoning`.

ADR 0061 defines that cleared review gates make records automation-eligible, not side-effect-authorized.

ADR 0062 keeps automation policy design out of scope for the MVP.

ADR 0063 requires preview and confirmation before MVP side effects execute.

ADR 0064 keeps Side-Effect Previews summary-first for bulk usability.

ADR 0065 requires post-action summaries after confirmed side effects execute.

ADR 0066 keeps post-action summaries ephemeral by default in the MVP.

ADR 0067 defines file/section previews for durable GTM context writes.

ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.

ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

ADR 0077 defines the CSV/table-file input scope for MVP bulk mode.

## Consequences

- Users can understand the whole batch without reading every record.
- Downstream skills get a compact entry point for prioritization and follow-up workflows.
- Bulk outputs remain auditable at both record and run level.
- Common uncertainty patterns can guide follow-up context work, such as improving ICPs, personas, or source coverage.
