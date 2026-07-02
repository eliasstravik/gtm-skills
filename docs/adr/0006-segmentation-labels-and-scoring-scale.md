# ADR 0006: Segmentation labels and 1-100 scoring scale

## Status

Accepted

## Context

The MVP includes both segmentation and scoring for accounts and leads. These need distinct responsibilities so users understand the difference and downstream skills can compose them reliably.

Segmentation should answer "which ICP/persona bucket is this?" Scoring should answer "how strong and urgent is this fit?"

## Decision

Segmentation assigns a categorical label. Scoring assigns a 1-100 priority score plus a qualitative fit label.

### Segmentation

Account segmentation classifies an account into one defined ICP segment.

Lead segmentation classifies a person into one defined persona.

If no defined ICP segment or persona matches, use the canonical machine-readable label:

```text
no-match
```

User-facing copy can explain this as "No matching ICP/persona" or "Does not match any defined segment," but the structured label should be `no-match`.

### Scoring

Account scoring and lead scoring use a 1-100 scale.

Recommended bands:

| Score | Fit label | Meaning |
|---:|---|---|
| 1-49 | `not-a-fit` | Do not prioritize; likely skip unless the user has a special reason. |
| 50-74 | `good-fit` | Worth pursuing or nurturing, but not a top priority. |
| 75-89 | `great-fit` | Strong fit; prioritize for active research/outreach. |
| 90-100 | `excellent-fit` | Best-fit/highest-priority; pursue urgently with high-confidence personalization. |

Every score should include:

- numeric score
- fit label
- evidence summary with source provenance
- key positives
- key risks or disqualifiers
- recommended action
- `confidence` as `low`, `medium`, or `high`
- `reasoning`, a short paragraph explaining the score and confidence
- `needs_review` as `true` or `false`

Segmentation outputs should include the assigned label plus enough provenance to explain the criteria and evidence behind the label, as well as `confidence`, `reasoning`, and `needs_review`.

ADR 0052 defines source provenance requirements for research, scoring, and segmentation outputs.

ADR 0053 defines the lightweight provenance-entry format and canonical source types.

ADR 0054 defines compact per-record provenance for bulk segmentation and scoring outputs.

ADR 0055 defines run-level summaries for bulk segmentation and scoring outputs.

ADR 0056 defines standard `confidence`, `reasoning`, and `needs_review` fields for scoring and segmentation outputs.

ADR 0057 defines that review explanation belongs in `reasoning`, not a separate `review_reasons` field.

ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`.

ADR 0059 defines that review-gated scoring and segmentation results should not drive automated downstream actions by default.

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

## Consequences

- Segmentation outputs are stable labels that can drive filtering, routing, and personalization.
- Scoring outputs are ranked priorities that can drive work order and SDR/BDR focus.
- The `no-match` label prevents ambiguous labels like "none," "other," or blank values.
- Later CRM integrations can map fit labels into standardized fields.
