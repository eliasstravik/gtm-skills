# ADR 0062: Automation policies are out of scope for MVP

## Status

Accepted

## Context

ADR 0061 defines that `needs_review: false` makes a result automation-eligible, but does not itself authorize side effects. Side effects require explicit user instruction or a configured automation policy / integration rule.

Designing automation policies now would require choosing policy file locations, rule syntax, approval scopes, integration boundaries, audit behavior, and per-system safeguards before the MVP has real integration usage.

## Decision

Automation policies are out of scope for the MVP.

For the MVP, skills may:

- accept explicit user instruction for a specific side effect,
- prepare drafts, proposals, queues, and ready lists,
- explain what side effect would be possible if authorized,
- preserve `needs_review`, `confidence`, `reasoning`, provenance, and open questions for later review or action.

For the MVP, skills should not define:

- automation policy files,
- rule syntax,
- approval scopes,
- policy inheritance,
- CRM-specific automation semantics,
- campaign-tool automation semantics,
- background side-effect execution rules,
- audit schemas for automated actions.

Automation policy remains an extension point for later integrations.

Rules:

1. The MVP supports side effects only through explicit user instruction in the moment plus a Side-Effect Preview and confirmation, as defined in ADR 0063.
2. Skills can prepare proposals, drafts, queues, and ready lists without executing side effects.
3. `needs_review: false` can make a record eligible for these non-side-effect workflows.
4. No MVP skill should require or generate automation policy configuration.
5. Future integration work may define automation policy shape when there is a concrete CRM, campaign, enrichment, or sync use case.
6. Until automation policies exist, references to configured automation policy are future-facing extension points, not MVP requirements.

## Consequences

- MVP GTM skills avoid premature permission-system design.
- Side-effect behavior stays simple: explicit user instruction, Side-Effect Preview, confirmation, then execution — otherwise no execution.
- Drafting, queueing, ranking, routing, and proposal workflows remain supported.
- Future integrations still have a clear place to add policy-based automation.
- ADR 0063 keeps MVP side effects visible through preview and confirmation.
- ADR 0064 keeps MVP Side-Effect Previews summary-first for bulk usability.
- ADR 0065 requires post-action summaries after confirmed side effects execute.
- ADR 0066 keeps post-action summaries ephemeral by default in the MVP.
- ADR 0067 defines file/section previews for durable GTM context writes.
- ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.
- ADR 0069 defines non-blocking auto-commit failure behavior for durable GTM context writes.
- ADR 0070 defines auto-commit isolation from unrelated working-tree changes.
- ADR 0071 defines that GTM context auto-commit does not auto-push by default.
- ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.
