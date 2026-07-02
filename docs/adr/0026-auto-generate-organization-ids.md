# ADR 0026: Auto-generate Organization IDs with user override

## Status

Accepted

## Context

Organization records need stable IDs for `~/.gtm/registry.json`, `gtm.yaml`, and repository paths under `~/.gtm/<organization-id>/`. Organization display names are human-readable and may not be globally unique across clients, subsidiaries, sandboxes, or duplicate projects.

Setup should make IDs easy by generating a sensible default while still allowing the user to preserve internal naming conventions.

## Decision

`gtm-setup` should auto-generate a readable stable Organization ID and allow the user to override it before writing.

Default examples:

```text
acme
google
google-cloud-partner-org
kiln-client
```

Generation rules:

1. Slugify Organization display name as lowercase kebab-case.
2. If the generated ID collides in `~/.gtm/registry.json`, append a disambiguator.
3. Show the generated Organization ID and repo path to the user before writing.
4. Allow user override before writing.
5. Once written, treat the Organization ID as stable; changing it later should be an explicit rename/migration operation.

Example registry entry:

```json
{
  "projects": {
    "acme": {
      "path": "~/.gtm/acme",
      "displayName": "Acme"
    }
  }
}
```

Example `gtm.yaml`:

```yaml
organization:
  id: acme
  display_name: Acme
```

## Consequences

- Setup is consistent across Organization IDs, Person IDs, and Workspace IDs.
- Duplicate or similar organization names can still be represented.
- Repo paths remain human-readable and stable.
