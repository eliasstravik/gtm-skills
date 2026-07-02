# ADR 0039: Omit unknown optional fields from generated `gtm.yaml`

## Status

Accepted

## Context

`gtm.yaml` is the project-local machine-readable index for a GTM Context Project. It needs enough structure for agents and scripts to resolve the Organization, default workspace, People, Business Units, Teams, and Workspaces.

Many useful fields are optional at setup: website, business unit, team, market, motion, offering, email, territory, and other descriptive metadata. Writing unknown optional fields as `null` makes generated files noisier and can imply the system has deliberately captured an absence rather than simply not knowing yet.

Markdown context files can hold fuzzy or partial descriptions first. Later, skills can promote stable facts into structured `gtm.yaml` fields when useful and user-approved.

## Decision

Generated `gtm.yaml` should omit unknown optional fields rather than writing `null` placeholders.

Default minimal generated `gtm.yaml`:

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

If setup captures more structure, include only the known fields:

```yaml
workspaces:
  google-cloud-smb-sdr:
    display_name: Google Cloud SMB SDR
    business_unit: google-cloud
    team: cloud-smb-sdr
    motion: outbound
    market: SMB
    offering: Google Cloud
    path: workspaces/google-cloud-smb-sdr
```

Rules:

1. Required fields must always be present.
2. Unknown optional fields should be omitted.
3. Known optional fields may be included.
4. Absence of an optional field means unknown/not captured, not false or explicitly none.
5. Do not write `null` placeholders for unknown setup values.
6. Skills should preserve unknown fields when editing `gtm.yaml` for forward compatibility.
7. Skills may promote stable facts from markdown into structured `gtm.yaml` fields when useful and user-approved.
8. Do not store long source lists in `gtm.yaml`; ADR 0047 puts confirmed source links in markdown context files.

## Consequences

- Generated `gtm.yaml` stays clean and minimal.
- Setup does not pretend to know market, motion, offering, or other metadata it has not captured.
- Markdown can carry fuzzy context until structure is useful.
- Downstream skills must treat missing optional fields as unknown and fall back to markdown context when needed.
