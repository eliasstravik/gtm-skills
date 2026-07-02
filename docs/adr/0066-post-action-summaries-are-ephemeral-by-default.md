# ADR 0066: Post-action summaries are ephemeral by default

## Status

Accepted

## Context

ADR 0065 requires a Side-Effect Execution Summary after confirmed side-effecting actions execute. These summaries give the user a concise account of what actually happened: records considered, updated, skipped, failed, and whether outreach, CRM updates, campaign triggers, syncs, or durable writes occurred.

It would be tempting to save these summaries as durable logs. That would create an audit-log system before the MVP has concrete CRM, campaign, enrichment, sync, or compliance requirements.

## Decision

Side-Effect Execution Summaries are ephemeral by default for the MVP.

Default behavior:

```text
Return the post-action summary to the user, but do not write it as a durable log.
```

A post-action summary should become durable only when:

- the side effect itself writes durable state and the summary is part of that confirmed durable output,
- the user explicitly asks to save or export the summary,
- a future integration defines audit/logging behavior,
- a later skill-specific workflow defines a concrete durable artifact for the summary.

Rules:

1. Do not write Side-Effect Execution Summaries to durable logs by default in the MVP.
2. Return the summary to the user immediately after execution.
3. If no side effects executed, still report that ephemerally.
4. If the user asks to save/export the summary, show the destination and follow the normal Side-Effect Preview and confirmation flow before writing.
5. If the side effect already writes durable state, the summary may reference safe durable handles such as file paths, record IDs, or job IDs.
6. Do not create an audit-log schema, log directory, retention policy, or integration-specific logging contract for the MVP.
7. Future integrations may define durable logging when there is a concrete CRM, campaign, enrichment, sync, or compliance need.

ADR 0067 defines that durable GTM context writes use file/section previews by default before execution.

ADR 0068 defines that commit-safe durable GTM context writes auto-commit; the commit itself is durable, but the post-action summary remains ephemeral unless explicitly saved/exported.

ADR 0069 defines that auto-commit failures are reported ephemerally and do not roll back successful writes.

ADR 0070 defines that auto-commit isolation/skip details are reported ephemerally rather than saved as durable logs.

ADR 0071 defines that push status is reported only when a push was explicitly requested and does not create a durable log by default.

ADR 0072 defines that accept/deny uncertainty decisions are reported ephemerally unless a confirmed durable workflow records them.

## Consequences

- MVP avoids accidentally designing an audit-log system.
- Users still get immediate visibility into actual execution outcomes.
- Durable logging remains available as an explicit user action or future integration feature.
- Side-effect summaries stay lightweight and session-oriented by default.
- ADR 0067 keeps durable context write previews readable without requiring raw full diffs by default.
- ADR 0068 allows post-action summaries to reference commit hashes without becoming durable logs themselves.
- ADR 0069 allows post-action summaries to report commit blockers without becoming durable logs.
- ADR 0070 allows post-action summaries to mention unrelated working-tree changes without committing or logging them.
- ADR 0071 allows post-action summaries to mention push status without making push logs durable by default.
- ADR 0072 keeps uncertainty-resolution summaries session-oriented by default.
