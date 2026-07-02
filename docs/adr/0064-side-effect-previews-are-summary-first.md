# ADR 0064: Side-effect previews are summary-first

## Status

Accepted

## Context

ADR 0063 requires a Side-Effect Preview and confirmation before MVP side effects execute. Bulk GTM workflows may involve dozens or hundreds of accounts, leads, rows, CRM records, context changes, or campaign queue entries.

A preview that dumps every affected record by default becomes unreadable and makes confirmation less safe. Users need to catch scope mistakes quickly, not inspect a wall of rows unless detail is genuinely needed.

## Decision

Side-Effect Previews are summary-first by default.

The default preview should show compact totals and important exceptions rather than a full per-record dump.

Example:

```md
About to update 250 CRM records:
- 211 marked ready
- 31 left unchanged
- 8 skipped because needs_review: true
- 0 outreach messages sent

Show detailed row list? no
Proceed?
```

Default preview content should include:

- action to execute,
- target system or durable destination,
- total records/files affected,
- key status/count breakdowns,
- records skipped because `needs_review: true`, if any,
- errors, conflicts, or unusual caveats,
- whether outreach, CRM updates, campaign triggers, or durable context writes will or will not happen.

Full per-record detail should be shown only when:

- the batch is small,
- the user asks for details,
- there are errors or conflicts,
- the action is unusually sensitive,
- the action affects a small named set where row-level confirmation is clearer than summary counts.

Rules:

1. Side-Effect Previews default to compact summaries.
2. Do not dump full row lists for large batches by default.
3. Always show enough totals and exceptions for the user to catch scope mistakes.
4. Offer or support a way to inspect details when useful.
5. Show full detail when the action is small, sensitive, or conflict/error-heavy.
6. If the user requests detail, show the relevant detail before asking for final confirmation.
7. If detail changes the scope, show a revised summary before execution.

ADR 0065 defines the matching post-action summary after a confirmed side effect executes.

ADR 0066 defines that post-action summaries are ephemeral by default in the MVP.

ADR 0067 defines file/section summaries as the default preview form for durable GTM context writes.

ADR 0068 defines that durable context write previews should show whether auto-commit will happen and the proposed commit message.

ADR 0069 defines that auto-commit failures do not roll back successful context writes.

ADR 0070 defines that auto-commit must isolate current-action changes from unrelated working-tree changes.

ADR 0071 defines that push previews are required only when a push is explicitly requested, because auto-commit never auto-pushes by default.

ADR 0072 defines that uncertainty previews should be plain-language accept/deny moments for mostly nontechnical users.

## Consequences

- Bulk side-effect previews remain readable.
- Confirmation focuses on scope, counts, exclusions, and risk signals.
- Users can still inspect details when needed.
- Large GTM workflows stay usable without weakening the preview-and-confirmation gate.
- ADR 0065 gives users a concise actual-outcome summary after execution.
- ADR 0066 keeps those post-action summaries from becoming durable logs by default.
- ADR 0067 applies the summary-first rule to durable GTM context writes.
- ADR 0068 includes commit intent in durable context write summaries.
- ADR 0069 keeps commit failure reporting summary-first and non-rollback.
- ADR 0070 keeps unrelated-change reporting summary-first and scoped.
- ADR 0071 keeps remote push intent explicit and summary-first.
- ADR 0072 keeps summary-first previews assistive rather than technical.
