# ADR 0024: Auto-generate workspace IDs with user override

## Status

Accepted

## Context

GTM Workspaces need stable IDs for `gtm.yaml` keys and filesystem paths under `workspaces/`. IDs should be readable, deterministic enough for agents to reason about, and easy for humans to recognize.

Setup often knows a chain such as Business Unit, Team, market, motion, or offering. This can produce a sensible default workspace ID, but users should be able to override it when they have a better internal naming convention.

## Decision

`gtm-setup` should auto-generate a readable stable workspace ID from the most specific available context and allow the user to override it before writing files.

Examples:

```text
default
google-cloud
google-cloud-smb-sdr
enterprise-ae
android-partnerships
uk-midmarket-ae
```

Default generation rules:

1. Simple/default setup uses `default`.
2. If only a Business Unit exists, use `<business-unit-id>` unless the user provides a clearer workspace name.
3. If a Team exists, use `<team-id>` unless the user provides a clearer workspace name.
4. If market, motion, offering, or role focus is supplied and makes the ID clearer, include it.
5. Slugify IDs as lowercase kebab-case.
6. Show the generated ID to the user and allow override before writing.
7. Once written, treat the ID as stable; changing it later should be an explicit rename/migration operation.

## Consequences

- Default workspaces are readable and standardized.
- Enterprise workspaces can reflect actual GTM operating scope.
- Users can preserve internal naming conventions.
