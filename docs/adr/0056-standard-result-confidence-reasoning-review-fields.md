# ADR 0056: Standard result fields for confidence, reasoning, and human review

## Status

Accepted

## Context

ADR 0052 requires research, scoring, and segmentation outputs to cite source provenance. ADR 0053 defines a lightweight provenance format. ADR 0054 defines compact per-record provenance for bulk outputs, and ADR 0055 defines bulk run-level summaries.

Those decisions explain evidence, but each result also needs a small, predictable judgment layer: how confident the agent is, why it reached the result and confidence level, and whether a human should review the record before acting.

## Decision

Every research, scoring, and segmentation result should include these standard fields:

```yaml
confidence: medium
reasoning: >
  Short paragraph explaining the result and why confidence is medium.
needs_review: false
```

Allowed confidence values:

```text
low
medium
high
```

Rules:

1. `confidence` is required on every one-off result and every bulk record.
2. `confidence` must be one of `low`, `medium`, or `high`.
3. Do not use `unknown` as a confidence value. If confidence cannot be judged, use `low` and explain why in `reasoning`.
4. `reasoning` is required on every one-off result and every bulk record.
5. `reasoning` should be a short paragraph that explains both the result and the confidence level.
6. `reasoning` should reference the strongest evidence, important gaps, and material uncertainty, but should not replace the structured provenance fields.
7. `needs_review` is required on every one-off result and every bulk record.
8. `needs_review` must be a boolean: `true` or `false`.
9. A new unreviewed result with `confidence: low` starts with `needs_review: true`.
10. `confidence: medium` or `confidence: high` can still set `needs_review: true` for workflow, compliance, sensitivity, private-source, ambiguity, conflict, or disqualifier reasons.
11. Human review can clear the gate by setting `needs_review: false` and updating `reasoning`, as defined in ADR 0060.
12. `needs_review: false` means the result is ready to act on within the skill's normal assumptions; it does not mean the result is guaranteed true.
13. Common review triggers include low confidence, conflicting evidence, missing required input, high score with weak evidence, possible disqualifier, sensitive/private-source dependency, or an open question that affects the result.
14. When `needs_review: true`, `reasoning` should make the review trigger clear.
15. Do not add a separate standard `review_reasons` field; use `reasoning`, `confidence`, `open_questions`, and provenance instead.
16. `needs_review: true` blocks automated downstream actions by default, as defined in ADR 0059.
17. Do not add a separate `review_override` object to the core MVP output contract.
18. `needs_review: false` means automation-eligible, not side-effect-authorized, as defined in ADR 0061.
19. Do not expose sensitive URLs, tokens, invite links, signed URLs, or private source details in `reasoning`.

Example table fields:

```text
account,segment,score,confidence,reasoning,needs_review,top_evidence,open_questions
Acme,great-fit,82,low,"Strong ICP match and relevant compliance hiring signal, but company size is unclear and one proof-point source is indirect, so confidence is low and human review is required.",true,"ICP match; compliance hiring","company size unclear"
```

Example structured result:

```yaml
account: Acme
segment: compliance-led-fintech
score: 82
confidence: low
reasoning: >
  Acme matches the regulated fintech infrastructure ICP and shows a current compliance hiring signal.
  Confidence is low because company size is unclear and one proof-point source is indirect, so human review is required.
needs_review: true
evidence:
  - claim: ICP match
    source: workspace ICP definition
    type: workspace-context
    freshness: current
    confidence: high
```

## Consequences

- Every result has a predictable decision surface for users and downstream skills.
- Confidence is simple and comparable across one-off and bulk outputs.
- Short reasoning makes the result understandable without reading every evidence entry.
- Human-review workflow becomes explicit instead of hidden in prose.
- ADR 0057 keeps the core output contract simple by using `reasoning` instead of a separate `review_reasons` field.
- ADR 0058 defines that new low-confidence results start with `needs_review: true`.
- ADR 0059 defines that `needs_review: true` gates automated downstream actions by default.
- ADR 0060 defines that human review clears the gate by updating `needs_review` and `reasoning`, not by adding an override object.
- ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized.
- ADR 0062 keeps automation policy design out of scope for the MVP.
- ADR 0063 requires preview and confirmation before MVP side effects execute.
- ADR 0064 keeps Side-Effect Previews summary-first for bulk usability.
- ADR 0065 requires post-action summaries after confirmed side effects execute.
- ADR 0066 keeps post-action summaries ephemeral by default in the MVP.
- ADR 0067 defines file/section previews for durable GTM context writes.
- ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.
- ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.
- ADR 0070 defines auto-commit isolation from unrelated working-tree changes.
- ADR 0071 defines that GTM context auto-commit does not auto-push by default.
- ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.
