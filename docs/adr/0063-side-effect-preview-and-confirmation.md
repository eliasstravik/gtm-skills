# ADR 0063: Side-effecting actions require preview and confirmation in MVP

## Status

Accepted

## Context

ADR 0061 separates automation eligibility from side-effect authorization. ADR 0062 keeps automation policy design out of scope for the MVP, so explicit user instruction starts a side-effect flow, but execution still waits for a Side-Effect Preview and confirmation.

Explicit instruction should still not be interpreted too broadly. A skill may be asked to “update these records” or “send this,” but before executing external or durable side effects it should show the user exactly what will happen and wait for confirmation.

## Decision

Side-effecting actions require a concise preview and confirmation before execution in the MVP.

Side-effecting actions include:

- sending outreach,
- updating CRM fields,
- enriching a durable GTM Context Repository,
- marking accounts or leads ready in an external system,
- triggering campaigns,
- syncing results to another system,
- writing durable changes based on research/scoring/segmentation outputs.

A Side-Effect Preview should be summary-first by default, as defined in ADR 0064. It should state:

- the action that will be executed,
- the target system or durable destination,
- the number of records or files affected,
- important grouping/counts,
- records skipped because `needs_review: true`, if any,
- whether outreach, CRM updates, campaign triggers, or durable context writes will or will not happen,
- any material caveats the user should see before confirming.

Example:

```md
About to update 12 CRM records:
- 9 marked ready
- 3 moved to review
- 0 outreach messages sent
- 0 campaign triggers started

Proceed?
```

Rules:

1. Explicit user instruction is necessary but not sufficient for MVP side effects.
2. Before executing a side effect, show a concise Side-Effect Preview.
3. Execute only after the user confirms the preview.
4. The preview should be short but specific enough to prevent surprising side effects.
5. The preview should call out skipped review-gated records when applicable.
6. If the user changes scope after preview, show a revised preview before execution.
7. Non-side-effecting actions such as ranking, routing, drafting, grouping, summarizing, and proposal generation do not require a Side-Effect Preview.
8. Host/tool confirmation rules still apply even after the user confirms the Side-Effect Preview.

ADR 0064 defines that Side-Effect Previews default to compact summaries rather than full row dumps.

ADR 0065 defines the post-action Side-Effect Execution Summary after execution.

ADR 0066 defines that post-action summaries are ephemeral by default in the MVP.

ADR 0067 defines file/section previews for durable GTM context writes.

ADR 0068 defines auto-commit behavior for commit-safe durable GTM context writes.

ADR 0069 defines that auto-commit failures do not roll back successful durable GTM context writes.

ADR 0070 defines that auto-commit must not sweep unrelated working-tree changes.

ADR 0071 defines that GTM context pushes require explicit preview and confirmation and are never implied by auto-commit.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- MVP side effects stay visible and deliberate without designing automation policies.
- Explicit instruction cannot silently expand into broader external or durable changes.
- Users get a final chance to catch scope mistakes before execution.
- Skills can still prepare drafts, proposals, queues, and ready lists without preview friction.
- ADR 0064 keeps previews readable for bulk workflows by making them summary-first.
- ADR 0065 reports what actually happened after side effects execute.
- ADR 0066 keeps post-action summaries from becoming durable logs by default.
- ADR 0067 keeps durable context write previews readable without requiring raw full diffs by default.
- ADR 0068 makes git commit behavior visible in durable context write previews and summaries.
- ADR 0069 makes git commit failures visible without undoing successful writes.
- ADR 0070 makes git commit scope visible and limited to the confirmed action.
- ADR 0071 keeps remote push side effects explicit.
- ADR 0072 keeps previews user-facing and accept/deny-oriented when uncertainty remains.
