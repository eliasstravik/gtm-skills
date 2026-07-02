# ADR 0016: Keep active user state outside shared context repositories

## Status

Accepted

## Context

A GTM Context Project is meant to be a shared git repository for a team. It can contain shared People, Teams, Business Units, Workspaces, ICPs, personas, and scoring models.

However, the current active organization, active person, and active workspace are user-specific. If those values live in `gtm.yaml`, then one user's local selection would be committed and would affect everyone else who pulls the repo.

## Decision

Active state is Local GTM State and must not be committed to a shared GTM Context Repository.

Local active state includes:

- active organization / project
- active person
- active workspace
- local last-used timestamps

By default, Local GTM State lives in the home-level registry outside any project repo:

```text
~/.gtm/
  registry.json        # local, not committed
  <organization>/      # git repo, shared context
    .gitignore         # ignores local override files and ephemeral artifacts
    gtm.yaml           # committed shared index; no active_person or active_workspace
```

Each shared GTM Context Project should include `.gitignore` rules for ignored local override files such as `.gtm.local.json`, `.gtm.local.yaml`, and `.local/`.

Recommended `registry.json` shape:

```json
{
  "version": 1,
  "activeProject": "acme",
  "projects": {
    "acme": {
      "path": "~/.gtm/acme",
      "displayName": "Acme",
      "aliases": [],
      "createdAt": "2026-06-30T00:00:00Z",
      "lastUpdatedAt": "2026-06-30T00:00:00Z",
      "local": {
        "activePerson": "elias-stravik",
        "activeWorkspace": "default",
        "lastUsedAt": "2026-06-30T00:00:00Z"
      }
    }
  }
}
```

`gtm.yaml` may contain shared defaults, but not current active user state:

```yaml
version: 1
organization:
  id: acme
  display_name: Acme

default_workspace: default

people:
  elias-stravik:
    display_name: Elias Stråvik
    role: Founder
    default_workspace: default
    path: people/elias-stravik.md

workspaces:
  default:
    display_name: Default GTM Workspace
    path: workspaces/default
```

Resolution order:

1. If the user explicitly names an organization, person, or workspace, use that for the current task and update local state when appropriate.
2. Else use `~/.gtm/registry.json` for active project, active person, and active workspace.
3. Else fall back to the active person's `default_workspace` from `gtm.yaml`.
4. Else fall back to the project's `default_workspace` from `gtm.yaml`.
5. If still ambiguous, ask the user to choose.

During `gtm-setup`, local active state should be updated only after the shared scaffold exists. ADR 0035 defines the setup write order.

## Consequences

- Shared context repos remain safe for teams.
- Each person can have their own active organization/person/workspace without overwriting teammates.
- `gtm.yaml` remains a shared machine-readable index, not a local preferences file.
- `gtm-setup` must create/update both shared context files and local registry state.
- Previous references to `active_person` or `active_workspace` in `gtm.yaml` are superseded by this ADR.
