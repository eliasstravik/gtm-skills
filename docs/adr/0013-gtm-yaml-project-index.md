# ADR 0013: Use `gtm.yaml` as the project-local machine-readable index

## Status

Accepted

## Context

The GTM Home Registry at `~/.gtm/registry.json` indexes many Organization repositories. Each Organization repository also needs its own machine-readable index so skills can resolve shared workspaces, people, teams, and business units without parsing every markdown file. User-specific active selections are stored outside the shared repo.

Markdown files should remain the place for rich human-editable context. The index should be concise, structured, and safe for agents/scripts to update.

## Decision

Use `gtm.yaml` at the root of each GTM Context Project as the project-local machine-readable index.

Default minimal generated shape:

```yaml
version: 1

organization:
  id: acme
  display_name: Acme

default_workspace: default

business_units: {}
teams: {}

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

Unknown optional fields are omitted rather than written as `null` placeholders. ADR 0039 defines this convention.

Collections are maps keyed by stable IDs. Additional people can be represented as:

```yaml
people:
  jane-doe-acme-com:
    display_name: Jane Doe
    email: jane.doe@acme.com
    role: SDR
    team: cloud-smb-sdr
    default_workspace: google-cloud-smb-sdr
    path: people/jane-doe-acme-com.md
```

Responsibilities:

- `gtm.yaml` stores machine-readable shared project metadata, default workspace, and indexes of business units, teams, people, and workspaces.
- `gtm.yaml` omits unknown optional fields rather than writing `null` placeholders.
- `gtm.yaml` should not store long source lists; full source lists belong in markdown context files as defined in ADR 0047.
- `gtm.yaml` must not store user-specific active state such as active person or active workspace; that lives in Local GTM State such as `~/.gtm/registry.json`.
- `organization.md` stores rich Organization context.
- `business-units/*.md` stores rich Business Unit context.
- `teams/*.md` stores rich Team context.
- `people/*.md` stores rich Person context.
- `gtm-setup` creates `people/<person-id>.md` for the setup Person and references it from `gtm.yaml`.
- `workspaces/<workspace>/context.md` stores rich GTM Workspace context.

## Consequences

- Skills can resolve workspace and person/team context quickly.
- Markdown remains readable and editable by humans.
- Future validation scripts can check that `gtm.yaml` entries point to existing files/folders.
- Skills updating `gtm.yaml` must preserve unknown fields for forward compatibility.
