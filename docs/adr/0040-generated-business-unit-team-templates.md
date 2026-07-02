# ADR 0040: Use standard generated Business Unit and Team templates

## Status

Accepted

## Context

Business Units and Teams are optional in GTM Context Projects. `gtm-setup` scaffolds `business-units/` and `teams/` directories by default, but creates Business Unit and Team markdown files only when the user's setup-depth answer needs them to represent the actual context chain.

When these files are created, they should explain organizational scope without duplicating workspace-specific ICPs, personas, scoring models, or the active local user state. Workspace context still carries the actual GTM operating motion.

## Decision

If `gtm-setup` creates a Business Unit file, it should use this template:

```md
# <Business Unit Name>

## What this business unit is

<!-- Division, product line, department, subsidiary, region, or major business area. -->

## Scope

<!-- What belongs inside this business unit, and what does not. -->

## Offerings / focus areas

<!-- Durable high-level products, services, markets, or priorities. -->

## Notes / open questions

<!-- Unknowns agents should not assume. -->
```

If `gtm-setup` creates a Team file, it should use this template:

```md
# <Team Name>

## What this team is

<!-- Team purpose, motion, function, or responsibility. -->

## Scope

<!-- Segment, territory, market, product, customer type, or operational scope. -->

## Members / roles

<!-- Durable notes about who is on the team or what roles exist. Do not duplicate local active user state. -->

## Notes / open questions

<!-- Unknowns agents should not assume. -->
```

Rules:

1. Create Business Unit and Team files only when setup-depth requires them.
2. Keep these files scope-oriented.
3. Do not duplicate workspace-specific ICPs, personas, or scoring models here.
4. Do not duplicate local active user state here.
5. Leave unknown sections sparse rather than inventing facts.
6. Use `workspaces/<workspace>/context.md` for the GTM operating motion.
7. Use skill-owned workspace files for ICPs, personas, and scoring.
8. ADR 0041 defines source-assisted setup enrichment and confirmation before writing enriched durable Business Unit or Team context.

## Consequences

- Optional hierarchy has a consistent shape when needed.
- Small/default setup remains lightweight.
- Business Unit and Team files explain organizational scope without absorbing workspace or skill-owned context.
