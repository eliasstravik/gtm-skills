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
