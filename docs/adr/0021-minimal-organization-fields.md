# ADR 0021: Require minimal organization fields

## Status

Accepted

## Context

A GTM Context Project represents one Organization. The Organization needs enough structure for agents to identify the repo and display it clearly, but setup should not require full firmographic detail before the user can start.

An Organization may be a company, client, business, or account. It may start as only a name, especially in agency/client workflows.

## Decision

The minimum required Organization fields in committed `gtm.yaml` are:

```yaml
organization:
  id: acme
  display_name: Acme
```

`organization.md` should contain a lightweight human-editable skeleton:

```md
# Acme

## What this organization is

## Website / sources

## Notes / open questions
```

ADR 0032 defines the full generated `organization.md` template.

Optional structured fields include:

```yaml
website: https://example.com
category: B2B SaaS
stage: Series A
headquarters: Stockholm, Sweden
```

Rules:

1. `organization.id` and `organization.display_name` are required.
2. `organization.id` is a stable machine-readable ID.
3. `organization.display_name` is human-readable and does not need to be globally unique.
4. `gtm-setup` should auto-generate `organization.id`, show it with the repo path, and allow override before writing.
5. Website, category, stage, headquarters, and related firmographic fields are optional at setup.
6. Skills may enrich `organization.md` over time when the user explicitly promotes durable context.
7. Unknown optional Organization fields should be omitted from generated `gtm.yaml` rather than written as `null` placeholders.
8. Full source lists belong in `organization.md`, not `gtm.yaml`, as defined in ADR 0047.

## Consequences

- Setup stays lightweight.
- Agency/client workflows are supported.
- Agents have enough machine-readable information to resolve the Organization repo.
