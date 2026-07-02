# ADR 0058: Low confidence starts human review

## Status

Accepted

## Context

ADR 0056 defines standard result fields for research, scoring, and segmentation outputs: `confidence`, `reasoning`, and `needs_review`. ADR 0057 keeps review explanation in `reasoning` instead of a separate `review_reasons` field.

`confidence` is the epistemic judgment about how reliable the result is. `needs_review` is the workflow flag that tells the user or downstream process whether the result still needs inspection before acting. Low confidence should always block blind action, but human review can later clear the gate.

## Decision

Any new, unreviewed result with `confidence: low` must start with `needs_review: true`.

Rule:

```text
new unreviewed result + confidence: low -> needs_review: true
```

Medium and high confidence do not automatically mean no review is needed:

```text
confidence: medium -> needs_review: true or false
confidence: high   -> needs_review: true or false
```

Examples:

- Low confidence because evidence is weak -> `needs_review: true`.
- Medium confidence with a possible disqualifier -> `needs_review: true`.
- High confidence with a sensitive/private-source dependency -> `needs_review: true` may still be appropriate.
- High confidence with strong public evidence and no material ambiguity -> `needs_review: false`.

Rules:

1. A new unreviewed result with `confidence: low` starts with `needs_review: true`.
2. `confidence: medium` may still set `needs_review: true` when the record has material ambiguity, conflicting evidence, a possible disqualifier, or an open question that affects action.
3. `confidence: high` may still set `needs_review: true` when there is a workflow, compliance, sensitivity, or private-source reason to inspect before acting.
4. Human review can clear the gate by setting `needs_review: false` and updating `reasoning`, as defined in ADR 0060.
5. `needs_review: false` means the result is ready to act on within the skill's normal assumptions; it does not mean the result is guaranteed true.
6. When `needs_review: true`, `reasoning` should explain why review is needed.

ADR 0059 defines that `needs_review: true` gates automated downstream actions by default. ADR 0060 defines how human review clears the gate without adding an override object. ADR 0061 defines that `needs_review: false` is automation-eligible, not side-effect-authorized. ADR 0062 keeps automation policy design out of scope for the MVP. ADR 0063 requires preview and confirmation before MVP side effects execute. ADR 0064 keeps Side-Effect Previews summary-first for bulk usability. ADR 0065 requires post-action summaries after confirmed side effects execute. ADR 0066 keeps post-action summaries ephemeral by default in the MVP. ADR 0067 defines file/section previews for durable GTM context writes. ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes. ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes. ADR 0070 defines auto-commit isolation from unrelated working-tree changes. ADR 0071 defines that GTM context auto-commit does not auto-push by default. ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- New low-confidence outputs cannot be accidentally treated as ready-to-act.
- Confidence remains the reliability judgment, while `needs_review` remains the workflow flag.
- Medium/high-confidence records can still route to review for non-confidence reasons.
- Human review can clear the workflow gate without hiding low confidence.
- Downstream workflows can filter review queues with a simple boolean while still reading `reasoning` for context.
