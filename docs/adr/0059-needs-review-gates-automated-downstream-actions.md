# ADR 0059: `needs_review` gates automated downstream actions

## Status

Accepted

## Context

ADR 0056 defines `needs_review` as a required boolean on research, scoring, and segmentation results. ADR 0058 defines that new unreviewed low-confidence results start with `needs_review: true`, and ADR 0060 defines that human review can later clear the gate by updating `needs_review` and `reasoning`.

If downstream skills ignore `needs_review`, the flag becomes decorative rather than operational. Low-confidence, ambiguous, conflicting, or sensitive-source-dependent results could flow into outreach, CRM updates, durable context changes, or campaign triggers without human judgment.

## Decision

`needs_review: true` should block automated downstream actions by default.

A result with:

```yaml
needs_review: true
```

should not automatically trigger actions such as:

- sending outreach,
- updating CRM fields,
- enriching a durable GTM Context Repository,
- marking an account or lead as ready,
- triggering a campaign,
- recommending “act now” without a review step.

Allowed downstream behavior:

- add the result to a human review queue,
- summarize why review is needed using `reasoning`, `confidence`, `open_questions`, and provenance,
- group review items by confidence, open questions, segment, score band, or evidence pattern,
- prepare a draft that waits for approval,
- suggest what the human should verify before acting.

Rules:

1. `needs_review: true` blocks automated action by default.
2. Downstream skills may prepare drafts, queues, summaries, or recommendations that explicitly wait for human approval.
3. Downstream skills must not treat a review-gated result as ready-to-act.
4. The review gate applies to both one-off and bulk outputs.
5. The review gate applies even if the numeric score or segment label is otherwise favorable.
6. A user may clear the review gate for a specific action by reviewing the result and producing a revised result with `needs_review: false` and updated `reasoning`, as defined in ADR 0060.
7. Do not add a separate `review_override` object to the core MVP result contract.
8. `needs_review: false` means the result is eligible for downstream automation within the skill's normal assumptions; it does not authorize side effects by itself.
9. Side effects require explicit user instruction plus a Side-Effect Preview and confirmation in the MVP; future automation policies / integration rules are post-MVP extension points, as defined in ADR 0061, ADR 0062, and ADR 0063.
10. Skills should preserve `needs_review` when passing results between workflows.

## Consequences

- `needs_review` becomes an operational safety gate, not just explanatory metadata.
- Low-confidence and ambiguous outputs do not accidentally drive automated GTM actions.
- Bulk workflows can safely separate ready-to-act records from human-review queues.
- Downstream skills retain flexibility to draft or prepare actions without executing them prematurely.
- ADR 0060 keeps review clearing lightweight by updating `needs_review` and `reasoning`, not adding an override object.
- ADR 0061 separates automation eligibility from side-effect authorization.
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
