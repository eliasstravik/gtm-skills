# ADR 0015: Require an identified person and full context chain

## Status

Accepted, amended by ADR 0016

## Context

GTM Skills should tailor work to the person using them: their role, team, focus, and active GTM Workspace. A context repo without an identified user risks giving generic or mis-scoped guidance.

Small companies should not be forced to model business units and teams, but every usable context repo needs at least one complete chain that connects the Organization, the person using the repo, and the GTM Workspace they operate in.

## Decision

A GTM Context Project must have at least one full context chain and an identified active person.

Minimum simple chain:

```text
Organization → Person → GTM Workspace
```

Enterprise chain when needed:

```text
Organization → Business Unit → Team → Person → GTM Workspace
```

Rules:

1. `gtm-setup` must identify or create at least one Person.
2. `gtm-setup` must set the current/active person in Local GTM State, not in committed `gtm.yaml`.
3. The active Person record must include the minimum operational fields: `display_name`, free-text `role`, `default_workspace`, and `path`.
4. `gtm-setup` must create `people/<person-id>.md` for the setup Person.
5. The active Person must resolve to a default GTM Workspace.
6. Business Units and Teams are optional for small/simple organizations, but required when needed to disambiguate the person's scope.
7. Skills should use the active Person to tailor role-specific assumptions, outputs, and workspace selection.

Example simple MVP committed `gtm.yaml`:

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

Unknown optional workspace fields are omitted from generated `gtm.yaml` rather than written as `null` placeholders, as defined in ADR 0039.

Example local `~/.gtm/registry.json` state for the same user:

```json
{
  "activeProject": "acme",
  "projects": {
    "acme": {
      "path": "~/.gtm/acme",
      "local": {
        "activePerson": "elias-stravik",
        "activeWorkspace": "default"
      }
    }
  }
}
```

Optional Person fields include `email`, user-approved links/sources, `team`, `business_unit`, `focus`, `territory`, `goals`, and working/output preferences. These should not be required at setup unless needed to disambiguate the person's context chain.

ADR 0034 defines the generated `people/<person-id>.md` template. ADR 0041 defines source-assisted setup enrichment using user-approved source links.

ADR 0046 defines the distinction between required setup questions and optional enrichment questions.

## Consequences

- Setup has slightly more friction, but the agent can work with better role and scope context.
- Small companies remain supported with a simple Organization → Person → Workspace chain.
- Enterprise teams can model deeper chains when useful.
- Workspace selection becomes more reliable because Local GTM State identifies the active Person, and the active Person can carry a default workspace.
