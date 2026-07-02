# ADR 0057: Use reasoning instead of separate review reasons

## Status

Accepted

## Context

ADR 0056 defines standard result fields for research, scoring, and segmentation outputs: `confidence`, `reasoning`, and `needs_review`.

A separate `review_reasons` field would duplicate information already carried by `confidence` and `reasoning`. If `needs_review: true`, the result's short reasoning paragraph should already explain why the record needs review and what uncertainty, conflict, gap, or risk caused that judgment.

## Decision

Do not require or standardize a separate `review_reasons` field.

Use these fields instead:

```yaml
confidence: low
reasoning: >
  The account appears to match the ICP, but the strongest evidence is indirect and company size is unclear.
  Human review is needed before acting on the score.
needs_review: true
```

Rules:

1. `needs_review` remains required as a boolean.
2. `confidence` remains required as `low`, `medium`, or `high`.
3. `reasoning` remains required as a short paragraph explaining both the result and the confidence level.
4. When `needs_review: true`, `reasoning` should make the review trigger clear.
5. Do not add a separate standard `review_reasons` field.
6. If a downstream export needs review categories later, derive them from `reasoning`, `confidence`, `open_questions`, and provenance instead of adding them to the core output contract now.

ADR 0058 defines that new low-confidence results start with `needs_review: true`. ADR 0060 defines that human review can clear the gate by updating `needs_review` and `reasoning`.

ADR 0059 defines that `needs_review: true` gates automated downstream actions by default.

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

## Consequences

- Outputs stay simpler and less redundant.
- Users can look at `confidence` and `reasoning` to understand why review is needed.
- Bulk tables avoid another semi-duplicative text column.
- The output contract keeps one place for explanation: `reasoning`.
