# ADR 0061: `needs_review: false` makes results automation-eligible, not action-authorized

## Status

Accepted

## Context

ADR 0059 defines `needs_review: true` as a gate that blocks automated downstream actions by default. ADR 0060 defines how human review can clear that gate by setting `needs_review: false` and updating `reasoning`.

Clearing the review gate should not itself authorize side effects. A result can be good enough to use in downstream workflows while still requiring a separate permission layer before sending outreach, updating CRM, enriching durable context, or triggering campaigns.

## Decision

`needs_review: false` means automation-eligible, not side-effect-authorized. More explicitly, it means a result is **eligible** for downstream automation, not that side effects are automatically authorized.

A result with:

```yaml
needs_review: false
```

may be used for:

- ranking,
- routing,
- drafting,
- campaign queueing,
- CRM update proposals,
- ready lists,
- follow-up recommendations.

But side-effecting actions still require one of:

- explicit user instruction in the moment, or
- a configured automation policy / integration rule in a future post-MVP integration.

Examples of side effects that require separate authorization:

- sending outreach,
- updating CRM fields,
- enriching a durable GTM Context Repository,
- marking an account or lead as ready in an external system,
- triggering campaigns,
- syncing results to external systems.

Rules:

1. `needs_review: false` clears the human-review gate.
2. `needs_review: false` makes the result eligible for downstream automation.
3. `needs_review: false` does not, by itself, authorize side effects.
4. Side-effecting actions require explicit user instruction plus a Side-Effect Preview and confirmation in the MVP, as defined in ADR 0063.
5. Configured automation policies / integration rules are future extension points, not MVP requirements, as defined in ADR 0062.
6. Non-side-effecting downstream actions such as ranking, routing, drafting, grouping, and proposal generation can use `needs_review: false` results without another review step.
7. If a future configured automation policy authorizes side effects, the skill should still respect host/tool confirmation rules and integration-specific safeguards.
8. If there is no explicit instruction or future automation policy, downstream skills should prepare proposals or drafts rather than execute side effects.

## Consequences

- `needs_review` remains focused on result readiness.
- Permission to act remains separate from result confidence/review state.
- Ready-to-use records can flow through ranking and drafting workflows without prematurely executing external actions.
- Side effects remain controlled by user intent, preview confirmation, or future configured automation policy.
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
