# ADR 0060: Human review clears `needs_review` instead of adding an override object

## Status

Accepted

## Context

ADR 0059 defines `needs_review: true` as a gate that blocks automated downstream actions by default. A proposed `review_override` object would record explicit bypasses of that gate.

That is too heavy for the MVP output contract. The core result shape already has the fields needed to represent the state after review: `confidence`, `reasoning`, and `needs_review`.

## Decision

Do not add a `review_override` object or separate override metadata.

When a human reviews a gated result and decides it is ready to act on, downstream skills should produce a revised result with:

```yaml
confidence: low
reasoning: >
  Evidence remains indirect, so confidence is low. The user reviewed the uncertainty and approved proceeding for this specific action.
needs_review: false
```

Rules:

1. `needs_review` means “still requires human review before action.”
2. A new unreviewed low-confidence result should start with `needs_review: true`.
3. Human review can clear the gate by setting `needs_review: false`.
4. If review supplies new information, update `confidence` and `reasoning` accordingly.
5. If confidence remains low after review, `needs_review` may still become `false`, but `reasoning` must state that confidence remains low and that the human reviewed or accepted the risk.
6. Do not add `review_override`, `approved_by`, or other audit-style fields to the core MVP output contract.
7. If a downstream export or integration later needs audit metadata, it can layer that outside the core result contract.
8. `needs_review: false` means automation-eligible, not side-effect-authorized, as defined in ADR 0061.
9. Side-effecting actions require explicit user instruction plus a Side-Effect Preview and confirmation in the MVP, as defined in ADR 0063.
10. Future automation policies / integration rules are post-MVP extension points, as defined in ADR 0062.
11. Side-effecting actions must still follow host/tool confirmation rules for that action.

## Consequences

- The result contract stays small.
- Human review is represented by the current result state rather than a parallel override object.
- `reasoning` remains the single place to explain why a result is or is not review-gated.
- Low confidence can remain visible even after the human review gate has been cleared.
- ADR 0061 keeps permission to execute side effects separate from the review state.
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
