# GTM Context Project Instructions

## Context Resolution

Use `$GTM_HOME` when it is set. Otherwise use `~/.gtm`.

When a `gtm-` skill needs GTM context, resolve the GTM Context Project in this order:

1. Use explicit user instruction in the prompt when the user names a GTM project, Organization ID, project path, workspace, or person.
2. If the current working directory is inside a GTM Context Repository, use the nearest ancestor containing `gtm.yaml`.
3. Otherwise use the active project in `$GTM_HOME/registry.json`.

After choosing the project, resolve the active Person and GTM Workspace in this order:

1. Use any explicit person or workspace from the prompt.
2. Use registry local active person/workspace for the selected project when present.
3. Use the project `default_workspace` from `gtm.yaml` when no local active workspace is set.
4. Read `organization.md`, `people/<person-id>.md`, and `workspaces/<workspace-id>/context.md`.

If no GTM Context Project resolves, stop and say:

> I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

If the registry has multiple projects and none is active, ask the user to choose instead of guessing.

## Local State

Never commit local active state. Active organization, active person, and active workspace belong in `$GTM_HOME/registry.json` or ignored local override files.

## Durable Vs Ephemeral

Durable context belongs in this repo. Ephemeral outputs such as research briefs, lead notes, outreach drafts, batch outputs, logs, and temporary artifacts should not be committed unless the user explicitly promotes them.

## Workspace Rules

Skill-owned context files live under `workspaces/<workspace>/`.

- `gtm-define-icp` owns `icps.md`.
- `gtm-define-personas` owns `personas.md`.
- GTM scoring skills own `scoring.md`.

`gtm-setup` must not create those files.

## Safety

- Respect `.gitignore`.
- Never commit secrets, credentials, tokens, signed URLs, invite links, or `.env` files.
- Never mix context across organizations, people, or workspaces silently.
- Keep source links in markdown context files, not long lists in `gtm.yaml`.
- Treat saved source links and safe source labels as starting evidence, not guaranteed truth.
