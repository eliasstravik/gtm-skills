# ADR 0054: Bulk outputs carry compact per-record provenance

## Status

Accepted

## Context

ADR 0005 requires research, scoring, and segmentation skills to support one-off and bulk modes. ADR 0077 scopes MVP bulk mode to CSV/table-file inputs and defers native CRM/spreadsheet integrations. ADR 0052 requires source provenance for important claims and decisions. ADR 0053 defines a lightweight standard provenance format.

Bulk outputs need to remain scannable across many records, but each row or record still needs enough provenance to audit, rerun, or prioritize later. A long evidence block for every record would make CSV/table outputs unwieldy, while no evidence would make bulk qualification opaque.

## Decision

Bulk research, scoring, and segmentation outputs should carry compact per-record provenance by default, with expanded evidence only when useful.

For CSV/table-like outputs, include compact provenance and review columns:

```text
account,segment,score,confidence,reasoning,needs_review,top_evidence,open_questions
Acme,great-fit,82,medium,"Strong ICP match and relevant compliance hiring signal, but company size is unclear, so human review is needed before acting.",true,"ICP match; compliance hiring; case-study match","company size unclear"
```

For JSON/YAML/markdown bulk outputs, each record can include structured evidence:

```yaml
account: Acme
segment: compliance-led-fintech
score: 82
confidence: medium
reasoning: >
  Strong ICP match and relevant compliance hiring signal, but company size is unclear, so human review is needed before acting.
needs_review: true
evidence:
  - claim: ICP match
    source: workspace ICP definition
    type: workspace-context
  - claim: Compliance hiring
    source: LinkedIn jobs page
    type: newly-found-evidence
open_questions:
  - Company size unclear
```

Rules:

1. Every bulk record should include at least compact provenance sufficient to explain the top reason(s) for the result.
2. Include per-record `confidence` using `low`, `medium`, or `high`.
3. Include per-record `reasoning`, a short paragraph that explains the result and confidence.
4. Include per-record `needs_review` as `true` or `false`.
5. Set `needs_review: true` for new unreviewed records whenever `confidence: low`.
6. Human review can later clear the gate by setting `needs_review: false` and updating `reasoning`, as defined in ADR 0060.
7. Include per-record open questions or unresolved issues when they affect interpretation.
8. CSV/table outputs should stay scannable with compact columns such as `confidence`, `reasoning`, `needs_review`, `top_evidence`, and `open_questions`.
9. JSON, YAML, markdown, or richer outputs may include structured evidence arrays using the ADR 0053 provenance-entry fields.
10. Expand detailed evidence for high-priority, low-confidence, disputed, or user-selected records.
11. Do not expand every record by default if that would make the bulk output hard to scan.
12. Do not expose sensitive URLs, tokens, invite links, signed URLs, or private source details in bulk provenance.
13. Bulk outputs remain ephemeral by default unless the user explicitly promotes durable learnings into the GTM Context Project.
14. If a record is later promoted into durable context, preserve or summarize the provenance needed to audit the promoted claim.

ADR 0055 defines the run-level summary that accompanies bulk outputs in addition to per-record provenance.

ADR 0056 defines required result-level `confidence`, `reasoning`, and `needs_review` fields.

ADR 0057 defines that `reasoning` carries the review explanation instead of a separate `review_reasons` field.

ADR 0058 defines that new low-confidence records start with `needs_review: true`.

ADR 0059 defines that bulk records with `needs_review: true` should route to review rather than automated downstream actions.

ADR 0060 defines that human review clears the gate by updating `needs_review` and `reasoning`, not by adding an override object.

ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized.

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

- Bulk outputs remain readable while preserving auditability.
- Users can sort and filter by confidence, evidence, and open questions.
- Downstream skills can rerun or inspect specific records without reprocessing the entire batch.
- High-risk or high-value records can carry more detail without bloating the whole output.
