# ADR 0014: Use map-based entity indexes keyed by stable IDs

## Status

Accepted

## Context

`gtm.yaml` needs to index business units, teams, people, and workspaces. These collections may grow large, especially in enterprise contexts with hundreds of people. Agents and scripts need stable keys for lookup, patching, and cross-references.

People may share the same display name. The ID scheme must allow multiple people named "Jane Doe" without collisions.

## Decision

Use maps keyed by stable entity IDs for `business_units`, `teams`, `people`, and `workspaces`.

Example:

```yaml
business_units:
  google-cloud:
    display_name: Google Cloud
    path: business-units/google-cloud.md

teams:
  cloud-smb-sdr:
    display_name: Cloud SMB SDR Team
    business_unit: google-cloud
    path: teams/cloud-smb-sdr.md

people:
  jane-doe-acme-com:
    display_name: Jane Doe
    email: jane.doe@acme.com
    role: SDR
    team: cloud-smb-sdr
    default_workspace: google-cloud-smb-sdr
    path: people/jane-doe-acme-com.md

  jane-doe-2:
    display_name: Jane Doe
    role: AE
    team: cloud-enterprise-ae
    default_workspace: google-cloud-enterprise-ae
    path: people/jane-doe-2.md

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

ID rules:

- IDs are machine-readable keys, not display names.
- IDs must be unique within their collection.
- IDs should be lowercase, hyphenated, and stable.
- For people, include a disambiguator when names collide: email local-part/domain, username, employee identifier, or a numeric suffix.
- `gtm-setup` should auto-generate Person IDs, show them to the user, and allow override before writing.
- `display_name` remains the human-readable name and does not need to be unique.

## Consequences

- Agents can patch specific entries without scanning lists.
- Duplicate human names are supported.
- Cross-references can use stable IDs.
- Future importers from CRM/HRIS/SCIM can map external IDs into stable entity IDs while preserving human names separately.
