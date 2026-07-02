# ADR 0011: `gtm-setup` scaffolds only core project files

> Superseded by [ADR 0012](0012-organization-repo-with-gtm-workspaces.md). The setup scaffold now creates organization/workspace structure; skill-owned files still are not created by setup.

## Status

Superseded by ADR 0012

## Context

Earlier planning treated `icps.md`, `personas.md`, and `scoring.md` as part of the initial MVP project file set. That is too eager.

Those files are skill-specific durable context. They should be created when the relevant skill is invoked, not when the user merely initializes a GTM Context Project. Otherwise setup creates empty or premature files that imply definitions exist before the user has actually defined them.

## Decision

`gtm-setup` creates only the must-have project scaffold:

```text
~/.gtm/
  registry.json
  <project>/
    .git/
    AGENTS.md
    CLAUDE.md
    context.md
```

Responsibilities:

1. Ensure `~/.gtm/` exists.
2. Ensure `~/.gtm/registry.json` exists.
3. Create or select a GTM Context Project.
4. Create `~/.gtm/<project>/`.
5. Initialize git if the project is not already a git repository.
6. Create or update `AGENTS.md`.
7. Create or update `CLAUDE.md` as a compatibility shim to `AGENTS.md`.
8. Create or update `context.md` for product, offer, sales motion, proof, positioning, messaging, and disqualifiers.
9. Update `registry.json` with project path, aliases, created/last-used/last-updated timestamps, and active project.

`gtm-setup` must not create:

- `icps.md`
- `personas.md`
- `scoring.md`
- durable accounts/leads/campaigns/sequences/research/output folders

Skill-owned files are created by their owning skills:

- `define-icp` creates or updates `icps.md`.
- `define-personas` creates or updates `personas.md`.
- scoring-related skills create or update `scoring.md` when needed.

## Consequences

- Setup stays lightweight and does not imply ICPs/personas/scoring exist before definition.
- Hard prerequisite checks remain meaningful: if `icps.md`, `personas.md`, or `scoring.md` is missing, the relevant skill can route the user to the owner skill.
- The GTM Context Project stays clean and avoids premature empty files.
- ADR 0004 is superseded.
