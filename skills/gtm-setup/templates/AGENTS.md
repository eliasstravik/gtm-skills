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

## Path Safety

Before any GTM skill reads, writes, stages, or commits project files,
canonicalize the project root. IDs inside a project must be lowercase slug ids.
Reject derived child paths that are absolute, contain `..`, or resolve outside
the project root, including symlink escapes.

If no GTM Context Project resolves, stop and say:

> I could not resolve a GTM Context Project from this prompt, current directory, or local registry. Run `gtm-setup` or tell me which GTM project to use.

If the registry has multiple projects and none is active, ask the user to choose instead of guessing.

## Local State

Never commit local active state. Active organization, active person, and active workspace belong in `$GTM_HOME/registry.json` or ignored local override files.

## Durable Vs Ephemeral

Durable narrative context belongs in this repo. Entity data and throwaway job work do not.

Ephemeral outputs such as research briefs, lead notes, outreach drafts, batch outputs, logs, temporary artifacts, SQLite files, CSV staging files, and scripts belong under `.tmp/<skill-name>/`. Do not commit `.tmp/`.

Promote outputs only when the user explicitly asks and confirms the side effect:

- write to the user's own system through MCP or a connector, or
- export a user-requested file.

## Workspace Rules

Skill-owned context files live under `workspaces/<workspace>/`.

- `gtm-define-icp` owns `icps.md`.
- `gtm-define-personas` owns `personas.md`.
- `gtm-account-scoring` owns `account-scoring.md`.
- `gtm-lead-scoring` owns `lead-scoring.md`.

`gtm-setup` must not create those files.

## Safety

- Respect `.gitignore`.
- Never commit secrets, credentials, tokens, signed URLs, invite links, or `.env` files.
- Never commit `.tmp/` job workspaces or raw research scratch.
- Never mix context across organizations, people, or workspaces silently.
- Keep source links in markdown context files, not long lists in `gtm.yaml`.
- Treat saved source links and safe source labels as starting evidence, not guaranteed truth.
- Before fetching or printing saved source links, classify them when the setup
  classifier is available. Never fetch or print secret-bearing, tokenized,
  invite, local-only, or private-tunnel URLs; use redacted safe labels instead.
