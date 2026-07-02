# ADR 0018: `gtm-setup` creates the active person's markdown file

## Status

Accepted

## Context

A usable GTM Context Project requires an identified Person and a full context chain. Active user selection is Local GTM State and must not be committed, but the Person record itself is shared team context and should be durable.

If `gtm-setup` only writes the Person entry in `gtm.yaml`, there is no durable human-readable place for role, focus, responsibilities, working preferences, or future person-level context.

## Decision

`gtm-setup` must create a markdown file for the identified setup Person:

```text
people/<person-id>.md
```

The file is committed shared context. It is not the same as local active-person state.

Minimal skeleton:

```md
# <Display Name>

## Role
<role>

## Default workspace
<workspace-id>

## Links / sources
<!-- Optional LinkedIn, personal site, GitHub, X/Twitter, calendar/about page, or other user-approved profile/source links -->

## Focus
<!-- Optional -->

## Responsibilities
<!-- Optional -->

## Working preferences
<!-- Optional -->
```

ADR 0034 defines the full generated Person markdown template. ADR 0041 defines source-assisted setup enrichment using user-approved source links.

The committed `gtm.yaml` must reference the file:

```yaml
people:
  <person-id>:
    display_name: <Display Name>
    role: <Role>
    default_workspace: default
    path: people/<person-id>.md
```

The local active-person selection remains outside the repo, usually in `~/.gtm/registry.json`:

```json
{
  "projects": {
    "acme": {
      "local": {
        "activePerson": "<person-id>",
        "activeWorkspace": "default"
      }
    }
  }
}
```

## Consequences

- Every setup has a concrete Organization → Person → GTM Workspace chain.
- Skills have a durable human-readable place for person-level context.
- Team-shared repos can contain many People while each user keeps their active selection local.
- Setup has slightly more required input, but only the minimum operational Person fields are required.
