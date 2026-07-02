# ADR 0065: Side effects produce post-action summaries

## Status

Accepted

## Context

ADR 0063 requires a Side-Effect Preview and confirmation before MVP side effects execute. ADR 0064 makes those previews summary-first by default.

The preview explains what is expected to happen. After execution, the user also needs to know what actually happened: how many records were updated, skipped, unchanged, or failed; whether outreach or campaign triggers actually occurred; and what failures or follow-up items remain.

## Decision

Confirmed side-effecting actions produce a concise post-action summary after execution.

The post-action summary should report actual outcomes, not just repeat the preview.

Example successful summary:

```md
CRM update complete:
- 250 records considered
- 211 updated
- 31 unchanged
- 8 skipped because needs_review: true
- 0 failed

No outreach was sent.
No campaign triggers were started.
```

Example summary with errors:

```md
CRM update complete with errors:
- 225 records considered
- 211 updated
- 8 skipped because needs_review: true
- 6 failed

Failures:
- Acme — CRM record missing required owner field
- Globex — API timeout
```

A Side-Effect Execution Summary should include, when relevant:

- action executed,
- target system or durable destination,
- records/files considered,
- records/files created, updated, deleted, unchanged, skipped, or failed,
- records skipped because `needs_review: true`, if any,
- whether outreach was sent,
- whether CRM fields were updated,
- whether campaign triggers started,
- whether durable context was written,
- whether a git commit was created, skipped, or failed for durable context writes,
- whether a push was created, skipped, or failed when explicitly requested,
- commit hash and commit message when a commit was created,
- git commit failure reason and uncommitted status when auto-commit failed,
- unrelated working-tree changes left uncommitted when practical,
- auto-commit skip reason when target-file or target-section isolation was unclear,
- safe handles for follow-up such as file paths, record IDs, or job IDs when appropriate,
- concise failures or next actions when execution was partial.

Rules:

1. Every executed side-effecting action should produce a Side-Effect Execution Summary.
2. The summary reports what actually happened, not only what was planned.
3. Use the same key categories as the preview where possible so the user can compare planned vs actual scope.
4. Distinguish updated, unchanged, skipped, and failed records.
5. Call out records skipped because `needs_review: true`.
6. Call out whether outreach, CRM updates, campaign triggers, syncs, or durable writes actually occurred.
7. Include concise failure details when failures are actionable.
8. Avoid exposing secrets, sensitive URLs, tokens, signed links, or private source details in summaries.
9. Keep summaries compact by default; provide full detail only for small batches, user-requested detail, failures, conflicts, or sensitive actions.
10. If no side effects executed, say so explicitly.
11. For durable GTM context writes, report changed files/sections and commit status.
12. If auto-commit failed after successful writes, report that the files remain written and uncommitted.
13. If auto-commit skipped because unrelated or overlapping working-tree state made isolation unclear, report that skip reason and uncommitted status.
14. If a push was explicitly requested, report push status, remote, branch, and failure reason when applicable.

ADR 0066 defines that Side-Effect Execution Summaries are ephemeral by default and should not be written as durable logs unless explicitly saved/exported, included in a confirmed durable side effect, or governed by future integration logging.

ADR 0067 defines file/section previews for durable GTM context writes and expects changed files/sections to appear in post-action summaries when durable context writes execute.

ADR 0068 defines when durable GTM context writes auto-commit and expects commit status/hash in the post-action summary.

ADR 0069 defines that auto-commit failures do not roll back successful durable GTM context writes.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- Preview and post-action summary form a clear before/after pair.
- Users get a handle for follow-up without needing a full audit system.
- Partial failures are visible and actionable.
- Bulk workflows stay readable while still reporting real execution outcomes.
- ADR 0066 avoids turning post-action summaries into a default durable audit-log system.
- ADR 0067 makes durable-context post-action summaries report files/sections changed.
- ADR 0068 makes durable-context post-action summaries report auto-commit outcomes.
- ADR 0069 makes commit failure summaries explicit without treating them as write failures.
- ADR 0070 makes summaries report unrelated changes or isolation-related commit skips.
- ADR 0071 makes push outcomes explicit only when push was separately requested.
- ADR 0072 keeps summaries plain-language and useful when uncertainty was resolved by accept/deny preview.
