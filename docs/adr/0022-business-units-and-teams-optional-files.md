# ADR 0022: Business Units and Teams are scaffolded as folders but not created by default

## Status

Accepted

## Context

GTM Context Projects must support both small companies and enterprise teams. Small companies should not be forced to model Business Units or Teams. Enterprise users may need them to represent chains like:

```text
Organization → Business Unit → Team → Person → GTM Workspace
```

The default `gtm-setup` flow should keep setup lightweight while still leaving a standard place for deeper organization structure.

## Decision

`gtm-setup` always scaffolds empty folders:

```text
business-units/
teams/
```

`gtm-setup` does not create Business Unit or Team markdown files by default.

The simple default chain remains:

```text
Organization → Person → GTM Workspace
```

If the user provides an enterprise/deeper chain during setup, `gtm-setup` may create:

```text
business-units/<business-unit-id>.md
teams/<team-id>.md
```

and reference them from `gtm.yaml`.

`gtm-setup` should determine this with one setup-depth question: simple/default workspace, add business unit, add business unit + team, or add team only.

ADR 0040 defines the generated Business Unit and Team markdown templates.

Rules:

1. Business Units and Teams are optional entities.
2. Their directories are scaffolded by default for standardization.
3. Files are created only when needed to disambiguate or represent the user's actual context chain.
4. Workspaces may reference Business Units and Teams when they exist.
5. People may reference Teams and/or Business Units when they exist.

## Consequences

- Small-company setup remains lightweight.
- Enterprise structure has a standard home.
- Agents can rely on folder conventions without forcing unnecessary hierarchy.
