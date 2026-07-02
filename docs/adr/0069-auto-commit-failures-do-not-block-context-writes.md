# ADR 0069: Auto-commit failures do not block context writes

## Status

Accepted

## Context

ADR 0068 defines that commit-safe durable GTM context writes auto-commit by default. Git commit is valuable because it captures safe or reviewed durable context in repository history, but git can fail for reasons unrelated to whether the context write itself succeeded: missing `user.name` or `user.email`, unavailable git binary, hooks, locks, filesystem permissions, or other local repository issues.

If the files were written successfully, rolling them back only because auto-commit failed would be surprising and could destroy the user's approved durable context update. This matches `gtm-setup` behavior: commit failure should not roll back scaffolded files.

## Decision

Auto-commit failures do not block or roll back successful durable GTM context writes.

If files write successfully but the auto-commit fails, keep the files and report the commit failure in the Side-Effect Execution Summary.

Example:

```md
GTM context update complete:
- 3 files updated
- Git commit failed: user.name/user.email not configured

Changes remain uncommitted.
```

Rules:

1. A successful file write remains successful even if git commit fails.
2. Do not roll back durable GTM context writes solely because auto-commit failed.
3. Report the exact commit blocker when available.
4. State clearly that changes remain uncommitted.
5. Include changed files/sections in the Side-Effect Execution Summary so the user can inspect or commit manually.
6. If a commit partially stages files before failing, leave the working tree as-is and report the observed state rather than trying to repair it silently.
7. If git is unavailable or repository state is invalid, write the files when the write itself is safe and approved, then report that no commit was created.
8. A failed auto-commit does not authorize retries with broader scope or destructive cleanup.
9. The user can fix git configuration/state and commit manually, or rerun a later safe commit workflow.

ADR 0070 defines that auto-commit must not sweep unrelated working-tree changes and should skip commit when current-action isolation is unclear.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for cases where commit or push blockers can be explained and accepted/denied.

## Consequences

- Approved durable context writes are not lost because of local git configuration problems.
- Users get a clear recovery path: fix git and commit the already-written files.
- Auto-commit remains helpful without becoming a fragile all-or-nothing transaction.
- Setup and normal context-writing skills share the same non-rollback posture for commit failures.
- ADR 0070 distinguishes commit failures from deliberate commit skips caused by ambiguous working-tree isolation.
- ADR 0071 keeps local commit failures and remote push failures as separate concerns.
- ADR 0072 keeps blocker reporting actionable for nontechnical users.
