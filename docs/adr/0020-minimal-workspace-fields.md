# ADR 0020: Require minimal workspace fields

## Status

Accepted

## Context

A GTM Workspace is the operating scope where ICPs, personas, scoring, research, and segmentation are resolved. Workspaces need enough structure for agents to resolve paths and labels, but setup should not force users to perfectly define offering, market, motion, business unit, or team before they can start.

## Decision

The minimum required workspace fields in committed `gtm.yaml` are:

```yaml
workspaces:
  default:
    display_name: Default GTM Workspace
    path: workspaces/default
```

Everything else is optional structured metadata in `gtm.yaml` and should be included only when known:

```yaml
business_unit: google-cloud
team: cloud-smb-sdr
motion: outbound
market: SMB
offering: Google Cloud
```

Unknown optional fields should be omitted rather than written as `null` placeholders. ADR 0039 defines this convention.

`workspaces/<workspace>/context.md` should still encourage the user to describe the GTM scope in human language:

```md
# <Workspace Name>

## What this workspace is for

## Offering

## Market

## GTM motion

## Notes / open questions
```

ADR 0033 defines the full generated workspace `context.md` template.

Rules:

1. `display_name` and `path` are required for every workspace.
2. Offering, market, GTM motion, business unit, and team are optional at setup.
3. Skills can use markdown context when structured fields are absent.
4. Skills may later promote stable facts from markdown into structured `gtm.yaml` fields when useful and user-approved.

## Consequences

- Small companies and early users are not blocked by over-modeling.
- Enterprise workspaces can still add structured metadata.
- Agents have enough machine-readable information to locate the workspace.
