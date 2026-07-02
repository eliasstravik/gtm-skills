# ADR 0070: Auto-commit isolates confirmed context changes

## Status

Accepted

## Context

ADR 0068 defines that commit-safe durable GTM context writes auto-commit by default. ADR 0069 defines that auto-commit failures do not roll back successful writes.

A GTM Context Repository may already have uncommitted user work before a skill writes durable context. Auto-commit must not silently sweep those unrelated changes into a commit for the current skill action. Otherwise auto-commit becomes unsafe: users could accidentally commit notes, local experiments, unrelated edits, or partially completed work.

At the same time, unrelated changes in other files should not prevent a clean auto-commit for the files produced by the confirmed action.

## Decision

Auto-commit includes only the files or changes produced by the confirmed durable GTM context action.

Auto-commit must not stage or commit unrelated pre-existing working-tree changes. If unrelated changes exist in other files, leave them uncommitted and report them in the Side-Effect Execution Summary. If pre-existing uncommitted edits overlap the target file or section and the skill cannot clearly isolate the current action's changes, skip auto-commit and report that the context changes remain uncommitted.

Examples:

```md
GTM context update complete:
- 2 files updated
- Git commit created for those 2 files only: abc1234

Unrelated existing changes were left uncommitted:
- docs/notes.md
```

```md
GTM context update complete:
- 1 file updated
- Git commit skipped: target file had pre-existing uncommitted edits

Changes remain uncommitted.
```

Rules:

1. Auto-commit must commit only the change set produced by the confirmed durable GTM context action.
2. Unrelated pre-existing working-tree changes must not be staged or committed by auto-commit.
3. Unrelated changes in other files do not block auto-commit for the current action's isolated files.
4. If target files or target sections had pre-existing uncommitted edits and the current action cannot be isolated confidently, skip auto-commit.
5. If the skill can confidently isolate the current action from pre-existing edits, it may auto-commit only the isolated action changes.
6. The Durable Context Write Preview should say when existing unrelated changes were detected and will be left uncommitted, when practical.
7. The Side-Effect Execution Summary should list unrelated existing changes left uncommitted when practical.
8. If auto-commit is skipped because isolation is unclear, the summary must say the written files remain uncommitted.
9. Skipping auto-commit because isolation is unclear is not a write failure.
10. Do not use broad `git add .` or equivalent behavior for durable GTM context auto-commit.

ADR 0071 defines that GTM context auto-commit does not auto-push by default.

ADR 0072 defines that uncertainty about committing or pushing should be turned into a plain-language accept/deny preview when safe to summarize.

## Consequences

- Auto-commit remains trustworthy because it cannot accidentally commit unrelated user work.
- Clean current-action changes can still be committed even when the repo has unrelated edits elsewhere.
- Overlapping or ambiguous working-tree state degrades safely to uncommitted files.
- Post-action summaries give the user enough information to inspect or commit manually.
- ADR 0071 keeps publishing isolated commits to remotes as a separate explicit action.
- ADR 0072 keeps isolation safeguards from becoming technical homework for nontechnical users.
