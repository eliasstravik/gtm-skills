# ADR 0067: Durable GTM context writes use file/section previews

## Status

Accepted

## Context

ADR 0063 requires a Side-Effect Preview before MVP side effects execute. ADR 0064 makes those previews summary-first. Durable GTM context writes are side effects because they change the shared GTM Context Repository.

Raw markdown diffs can be useful, but dumping full diffs by default is too noisy for most context updates. Users usually need to confirm the scope of durable changes first: which files will change, which sections will be updated, and what kinds of content will be added, changed, or removed.

## Decision

Durable GTM context writes use file/section previews by default.

When a skill is about to write durable GTM context, the Side-Effect Preview should show a concise file/section summary rather than a raw full diff by default.

Example:

```md
About to update GTM context:
- workspaces/default/icps.md — update ICP criteria section
- workspaces/default/personas.md — add CFO persona
- workspaces/default/scoring.md — add scoring rubric

No outreach will be sent.
No CRM records will be updated.

Proceed?
```

A Durable Context Write Preview should include:

- files to create, update, preserve, or delete,
- sections to add, update, or remove,
- whether the change is new context, an edit to existing context, or a deletion,
- important conflicts, unresolved questions, or sensitive-source handling,
- whether the write will create a git commit,
- the proposed commit message when auto-commit will happen,
- whether non-context side effects such as outreach, CRM updates, or campaign triggers will or will not happen.

Show raw diffs only when:

- the user asks for the diff,
- the change is small,
- there are conflicts,
- the change is unusually sensitive,
- the skill is deleting or substantially rewriting existing durable context,
- the file/section summary is not enough to make the scope clear.

Rules:

1. Durable GTM context writes are side effects.
2. Durable GTM context writes require a Side-Effect Preview and confirmation before execution.
3. The default preview is file/section summary, not raw full diff.
4. The preview should identify the target files and sections.
5. The preview should call out creates, updates, deletes, and preserved files when relevant.
6. Show raw diffs when requested, small, conflict-heavy, unusually sensitive, destructive, or needed for clarity.
7. If the user requests a diff and then scope changes, show a revised file/section summary before execution.
8. After execution, include changed files/sections in the Side-Effect Execution Summary.
9. Post-action summaries remain ephemeral by default, as defined in ADR 0066.
10. Commit-safe durable context writes auto-commit by default, as defined in ADR 0068.
11. If auto-commit will happen, include commit intent and proposed commit message in the preview.
12. If auto-commit is skipped, include that in the post-action summary.
13. If auto-commit fails after files are written, do not roll back; include the blocker and uncommitted status in the post-action summary.
14. If unrelated working-tree changes exist, leave them out of auto-commit and report them when practical.
15. If target-file or target-section isolation is unclear, skip auto-commit and report uncommitted status.
16. Auto-commit does not push by default; any push requires its own explicit preview and confirmation as defined in ADR 0071.

ADR 0068 defines commit-safe durable GTM context writes and auto-commit behavior.

ADR 0069 defines non-blocking auto-commit failure behavior.

ADR 0070 defines auto-commit isolation from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for mostly nontechnical users.

## Consequences

- Durable context changes are visible without forcing users through huge markdown diffs.
- File/section summaries make scope confirmation easier.
- Raw diffs remain available when useful.
- Durable GTM Context Repository writes follow the same side-effect safety model as external integrations.
- Safe and reviewed durable context changes are captured in git by default.
- Commit failures stay visible without undoing approved file writes.
- Unrelated user edits stay out of current-action auto-commits.
- Remote publication remains a separate explicit side effect.
- Uncertain durable-context mechanics are turned into accept/deny previews when safe to summarize.
