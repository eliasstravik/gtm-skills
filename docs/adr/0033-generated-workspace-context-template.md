# ADR 0033: Use a standard generated workspace `context.md` template

## Status

Accepted

## Context

Each GTM Workspace is the operating scope where account/lead research, segmentation, scoring, and later outreach composition happen. It needs a durable, human-readable `context.md` that describes the scope of work.

However, workspace context is not the same as skill-owned definitions. ICPs, personas, and scoring models must remain owned by their respective skills and live in separate files under the workspace.

## Decision

`gtm-setup` should generate this `workspaces/<workspace>/context.md` template:

```md
# <Workspace Name>

## What this workspace is for

<!-- The GTM operating scope: business unit, team, market, motion, offer, or role focus. -->

## Offering

<!-- Product, service, solution, or package this workspace sells or supports. -->

## Market

<!-- Geography, vertical, company-size band, segment, or buyer market. -->

## GTM motion

<!-- Outbound, inbound, PLG, enterprise sales, channel/partnerships, lifecycle, customer expansion, etc. -->

## Target outcomes

<!-- Pipeline, meetings, expansion, retention, partner sourcing, launch adoption, etc. -->

## Messaging notes

<!-- Workspace-specific pitch, approved language, disallowed wording, hooks, narratives. -->

## Constraints / disqualifiers

<!-- Workspace-specific exclusions, bad-fit signals, compliance limits, unsupported segments. -->

## Notes / open questions

<!-- Unknowns agents should not assume. -->
```

Rules:

1. Keep this file scoped to the GTM Workspace.
2. Use it for durable workspace context: offering, market, motion, target outcomes, messaging notes, constraints, and open questions.
3. Do not put ICP definitions, personas, or scoring models here by default.
4. `define-icp` owns `workspaces/<workspace>/icps.md`.
5. `define-personas` owns `workspaces/<workspace>/personas.md`.
6. Scoring skills own `workspaces/<workspace>/scoring.md`.
7. Leave unknown sections sparse rather than inventing facts.
8. ADR 0041 defines source-assisted setup enrichment and confirmation before writing enriched durable Workspace context.

## Consequences

- Agents have a standard place for workspace-level GTM context.
- Skill-owned definitions remain separate and composable.
- Small/default workspaces can start sparse and grow over time.
