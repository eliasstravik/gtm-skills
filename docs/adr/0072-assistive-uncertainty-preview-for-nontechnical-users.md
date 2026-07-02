# ADR 0072: Assistive uncertainty previews for nontechnical users

## Status

Accepted

## Context

GTM Skills users will often be nontechnical. They should not need to understand git mechanics, repository state, commit graphs, remotes, or implementation details to get useful work done.

Earlier decisions protect users from surprising side effects through previews, confirmations, review gates, commit-safe auto-commit, auto-commit isolation, and no default auto-push. These safeguards should not turn the product into a system that frequently stops and asks users to solve technical problems. The agent should do as much useful work as safely possible, then ask for a simple accept/deny decision when something material is uncertain.

## Decision

GTM Skills should use assistive defaults for nontechnical users: do the safe or clearly intended work automatically, and use plain-language accept/deny previews when material uncertainty remains. ADR 0073 further specifies that these previews should include the agent's recommended choice by default.

This means skills should:

- infer the obvious user intent from the current workflow,
- perform safe discovery and mechanical checks automatically,
- complete safe, confirmed, or clearly scoped steps without asking users to choose implementation details,
- avoid exposing technical complexity unless it affects the user's decision,
- show a concise preview and ask for approval when an action is uncertain, higher blast radius, or cannot be safely isolated.

Example for push uncertainty:

```md
I can publish the GTM context update, but this branch also has 2 other local commits.

About to push:
- GTM context update: 1 commit
- Other local commits that would also be published: 2

Nothing will be sent to customers.
No CRM records will be updated.

Proceed with this push?
```

If the user declines:

```md
No remote changes made.
Your GTM context commit remains saved locally.
```

Rules:

1. Prefer safe action over asking the user to make technical choices.
2. Use read-only discovery to reduce uncertainty before asking the user.
3. If an action is safe, reversible, local-only, or already confirmed, proceed according to the relevant workflow.
4. If material uncertainty remains, show an accept/deny preview rather than failing silently or asking an open-ended technical question.
5. Previews should explain consequences in user-facing terms, not only technical terms.
6. When a technical detail matters, translate it into impact: what will be changed, published, skipped, or left alone.
7. Do not execute higher-blast-radius side effects silently just because they are technically possible.
8. Do not force the user to resolve implementation details when the agent can choose a safe default.
9. If the user denies an uncertain action, keep already completed safe work and report what remains local/uncommitted/unpushed.
10. If uncertainty cannot be summarized safely, stop and ask a focused question with a recommended default.
11. When presenting options, include the agent's recommended choice by default, following ADR 0073.

## Consequences

- Nontechnical users get useful end-to-end help instead of git/process homework.
- Safety gates remain, but they become clear accept/deny moments.
- Push and commit flows favor doing the obvious helpful thing while still preventing surprising publication or unrelated side effects.
- The system can handle messy repository state by explaining the impact and asking for approval when needed.
