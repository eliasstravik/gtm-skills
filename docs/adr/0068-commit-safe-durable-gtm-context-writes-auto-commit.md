# ADR 0068: Commit-safe durable GTM context writes auto-commit

## Status

Accepted

## Context

ADR 0067 defines Durable Context Write Previews for GTM Context Repository writes. Git commits are also durable side effects. Earlier setup decisions already create an initial setup commit and repair commits by default when setup writes safe scaffold changes.

For normal durable context-writing skills, leaving every write uncommitted creates extra manual work and makes safe, reviewed context changes easier to lose. But committing unclear, sensitive, destructive, or unreviewed content automatically would make the repository history less trustworthy.

## Decision

Durable GTM context writes auto-commit by default when every written change is commit-safe.

A change is commit-safe when it is one of:

- generated scaffold or repair content,
- deterministic skill-owned context created from explicit user input,
- source-assisted context that the user reviewed and approved,
- unclear or conflicting context that the user explicitly reviewed and approved,
- non-destructive updates to existing context whose scope is clear in the Durable Context Write Preview.

A change is not commit-safe when it includes:

- secrets, credentials, tokens, signed URLs, invite links, or local-only paths,
- unapproved private/internal source URLs,
- unresolved conflicts represented as facts,
- unclear source-assisted claims the user has not reviewed,
- results with `needs_review: true` being promoted into ready-to-act durable context,
- destructive deletes or substantial rewrites that were not explicitly approved,
- unexpected files outside the GTM Context Repository scope.

Preview requirement:

```md
About to update GTM context:
- workspaces/default/icps.md — update ICP criteria section
- workspaces/default/personas.md — add CFO persona

Will create git commit:
Update ICP and persona context

No outreach will be sent.
No CRM records will be updated.

Proceed?
```

Rules:

1. Confirmed durable GTM context writes should auto-commit when all written changes are commit-safe.
2. Safe generated setup and repair changes can auto-commit by default.
3. Source-assisted or unclear context can auto-commit only after the user reviews and approves it.
4. The Durable Context Write Preview must say whether a git commit will be created.
5. The preview should show the proposed commit message when auto-commit will happen.
6. If any written change is not commit-safe, do not auto-commit by default.
7. If the user explicitly approves an unclear, sensitive, destructive, or conflict-resolution change, it can become commit-safe for that write.
8. If files are written but auto-commit is skipped, the Side-Effect Execution Summary must say changes remain uncommitted.
9. After auto-commit, the Side-Effect Execution Summary should include commit status and the commit hash when available.
10. If files write successfully but auto-commit fails, do not roll back the files.
11. On auto-commit failure, report the exact blocker when available and state that changes remain uncommitted.
12. Auto-commit must stage and commit only the current confirmed action's isolated change set.
13. Unrelated pre-existing working-tree changes must be left uncommitted.
14. If target files or sections have pre-existing uncommitted edits and the current action cannot be isolated confidently, skip auto-commit.
15. Auto-commit must not push by default.
16. Local active state such as `~/.gtm/registry.json` remains local and is not committed.

ADR 0069 defines auto-commit failures as non-blocking for successful durable GTM context writes.

ADR 0070 defines how auto-commit isolates current-action changes from unrelated working-tree changes.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines assistive uncertainty previews for cases where commit or push scope is uncertain but can be explained clearly.

## Consequences

- Safe, reviewed GTM context changes are captured in git without extra manual steps.
- Unclear or sensitive changes do not silently enter shared history without review.
- Git history stays useful without requiring users to manually commit every safe context update.
- The preview and post-action summary make commit behavior visible.
- ADR 0069 keeps local git configuration failures from destroying approved context writes.
- ADR 0070 prevents auto-commit from sweeping unrelated user work into GTM context commits.
- ADR 0071 keeps remote publication separate from local auto-commit.
- ADR 0072 keeps auto-commit workflows helpful for nontechnical users while preserving accept/deny control.
