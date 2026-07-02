# ADR 0031: Use a standard generated `AGENTS.md` template

## Status

Accepted

## Context

Each GTM Context Project needs canonical shared agent instructions. ADR 0029 makes `AGENTS.md` canonical and `CLAUDE.md` a Claude Code compatibility shim using `@AGENTS.md`. ADR 0030 says `AGENTS.md` should contain generic operating rules and context-resolution instructions only, not duplicated active person, active workspace, or current organization state.

`gtm-setup` therefore needs a standard template that tells agents how to resolve context, separate durable context from ephemeral outputs, and avoid unsafe commits.

## Decision

`gtm-setup` should generate this `AGENTS.md` template:

```md
# GTM Context Project Instructions

## Context resolution

1. Read `~/.gtm/registry.json` for local active organization, person, and workspace.
2. Read `gtm.yaml` for shared organization, business-unit, team, person, and workspace indexes.
3. Read `organization.md` for organization-level context.
4. Read `people/<person-id>.md` for active person context.
5. Read `workspaces/<workspace>/context.md` for active GTM workspace context.

## Local state

Never commit local active state. Active organization, active person, and active workspace belong in `~/.gtm/registry.json` or ignored local override files.

## Durable vs ephemeral

Durable context belongs in this repo. Ephemeral outputs such as research briefs, lead notes, outreach drafts, batch outputs, and temporary artifacts should not be committed unless the user explicitly promotes them.

## Workspace rules

Skill-owned context files live under `workspaces/<workspace>/`.

- `define-icp` owns `icps.md`
- `define-personas` owns `personas.md`
- scoring skills own `scoring.md`

`gtm-setup` must not create those files.

## Safety

- Respect `.gitignore`.
- Never commit secrets.
- Never commit `.env` files.
- Never mix context across organizations or workspaces silently.
```

## Consequences

- Every generated GTM Context Project gives agents the same context-resolution contract.
- Shared instructions stay generic and safe for team repositories.
- User-local active state remains outside committed files.
- Skill-owned files remain controlled by their owning skills.
