# ADR 0030: Keep `AGENTS.md` as generic operating rules, not duplicated project state

## Status

Accepted

## Context

Each GTM Context Project includes `AGENTS.md` as the canonical shared instruction file for agents, and `CLAUDE.md` imports it with `@AGENTS.md`.

The context repo is shared across many people. Project-specific and user-specific state already has dedicated homes:

- Local active organization/person/workspace lives outside the repo in `~/.gtm/registry.json`.
- Shared project indexes live in `gtm.yaml`.
- Organization context lives in `organization.md`.
- Person context lives in `people/<person-id>.md`.
- Workspace context lives in `workspaces/<workspace>/context.md`.

If `AGENTS.md` duplicates active person, active workspace, or organization facts, it can drift from the source of truth and accidentally commit user-local state into a shared repo.

## Decision

`AGENTS.md` should contain generic operating rules and context-resolution instructions only. It should not duplicate generated project state or local active state.

`AGENTS.md` should include rules such as:

- Read `~/.gtm/registry.json` for local active organization/person/workspace.
- Read `gtm.yaml` for shared organization, people, team, business-unit, and workspace indexes.
- Read `organization.md`, `people/*.md`, and `workspaces/<workspace>/context.md` for human-readable context.
- Never commit local active state.
- Keep ephemeral outputs out of the repo unless explicitly promoted.
- Respect `.gitignore`.
- Create skill-owned files only when their owning skills are invoked.

ADR 0031 defines the standard generated `AGENTS.md` template.

`AGENTS.md` should not hardcode values such as:

```md
Active person: Elias
Active workspace: default
Current organization: Acme
```

Those values belong in `~/.gtm/registry.json`, `gtm.yaml`, or the relevant markdown context files.

## Consequences

- `AGENTS.md` stays stable across people sharing the repo.
- Context resolution has one canonical path instead of duplicated state.
- User-local state is less likely to be accidentally committed.
- Agents must resolve active state dynamically rather than relying on hardcoded instructions.
