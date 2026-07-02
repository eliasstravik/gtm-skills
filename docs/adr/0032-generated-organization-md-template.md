# ADR 0032: Use a standard generated `organization.md` template

## Status

Accepted

## Context

Each GTM Context Project represents one Organization. The Organization needs a durable, human-readable context file for company/client/account-level facts that are shared across workspaces.

Workspace-specific context belongs under `workspaces/<workspace>/context.md`. Skill-owned definitions such as ICPs, personas, and scoring models belong under the relevant workspace and should not be placed in `organization.md` by default.

## Decision

`gtm-setup` should generate this `organization.md` template:

```md
# <Organization Name>

## What this organization is

<!-- Short description of the company, client, business, or account. -->

## Website / sources

<!-- Official website, docs, public pages, CRM links, or other trusted sources. -->

## Products / offerings

<!-- Durable high-level products/services/offers. Specific workspace offerings can live in workspace context. -->

## Positioning

<!-- Durable company-level positioning, differentiators, and approved claims. -->

## Proof points

<!-- Durable proof, customers, case studies, metrics, testimonials, awards. -->

## Constraints / things to avoid

<!-- Claims, segments, geographies, industries, tactics, or wording to avoid. -->

## Notes / open questions

<!-- Unknowns agents should not assume. -->
```

Rules:

1. Keep `organization.md` organization-level only.
2. Do not put workspace-specific ICPs, personas, scoring, or motion details here by default.
3. Use `organization.md` for durable facts that are useful across many workspaces.
4. Leave sections sparse when unknown rather than inventing facts.
5. Promote durable learnings into this file only when the user explicitly asks.
6. ADR 0041 defines source-assisted setup enrichment and confirmation before writing enriched durable Organization context.
7. ADR 0047 defines how confirmed organization source links are saved in `Website / sources` and which links must not be committed.
8. ADR 0051 defines saved Organization source links as starting evidence for later account research, scoring, and segmentation, not guaranteed truth.

## Consequences

- Agents have a standard place for organization-level context.
- Workspace-specific context remains scoped to workspaces.
- The setup scaffold is useful without requiring the user to answer every section up front.
