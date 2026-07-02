# ADR 0071: GTM context auto-commit does not auto-push by default

## Status

Accepted

## Context

ADR 0068 defines that commit-safe durable GTM context writes auto-commit by default. ADR 0070 keeps those auto-commits scoped to the confirmed action's isolated change set.

A git push has a higher blast radius than a local git commit. Pushing publishes shared GTM context beyond the local repository, may notify or affect other collaborators, and depends on remotes, credentials, branch policy, and repository permissions. The MVP should capture safe context locally without surprising remote side effects.

ADR 0072 adds an assistive default for mostly nontechnical users: do safe discovery and safe work automatically, then use a plain-language accept/deny preview when push scope is uncertain.

## Decision

GTM context auto-commit never auto-pushes by default in the MVP.

Default behavior:

```text
write files → auto-commit safe isolated changes → do not push
```

A push may happen only when:

- the user explicitly asks to push,
- the Side-Effect Preview says the action will push to a specific remote and branch,
- credentials and remote configuration are available and safe,
- the commits to push are identified,
- a future workflow or integration explicitly defines push behavior.

If a user explicitly asks to push, the skill should do the mechanical discovery work: inspect the remote, branch, outgoing commits, and whether the current workflow's commits can be pushed without unrelated commits. If uncertainty remains, show a concise accept/deny preview rather than asking the user to reason through git internals.

Push preview example:

```md
About to push GTM context commits:
- remote: origin
- branch: main
- commits: 1
- latest commit: abc1234 Update ICP and persona context

No outreach will be sent.
No CRM records will be updated.

Proceed?
```

Rules:

1. Auto-commit does not imply push.
2. Do not push after setup, repair, or normal durable context writes by default.
3. Pushing GTM context is a side effect and requires a Side-Effect Preview and confirmation.
4. The preview must name the remote, branch, and commits or commit range to push when known.
5. If the remote, branch, credentials, or commit range is unclear, try safe discovery first; if still unclear, do not push until the user accepts a clear preview or answers a focused question.
6. Do not push unrelated commits silently; if unrelated commits would be pushed, explain that in the preview and require confirmation.
7. Do not push uncommitted working-tree changes; push only existing commits.
8. Do not create remotes or configure credentials as part of default MVP context writes.
9. The Side-Effect Execution Summary should report whether a push happened, was skipped, or failed.
10. If a push fails, do not roll back local commits or file writes; report the blocker and local commit status.
11. For nontechnical users, prefer “I can do this; here is what will be published. Proceed?” over “push skipped” when the remaining uncertainty can be summarized safely.

## Consequences

- Safe context can be captured locally without surprising remote publication.
- Users can batch, inspect, or coordinate commits before publishing them.
- Remote publication remains explicit and visible.
- Future workflows can add push behavior with clear authorization and preview rules.
- ADR 0072 keeps push workflows assistive for nontechnical users without hiding uncertainty.
