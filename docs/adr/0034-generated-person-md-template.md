# ADR 0034: Use a standard generated Person markdown template

## Status

Accepted

## Context

Each usable GTM Context Project requires an identified Person and a full context chain. The shared Person record lives in `gtm.yaml` and `people/<person-id>.md`, while the local active-person selection lives outside the repo in `~/.gtm/registry.json`.

The Person markdown file should provide enough durable context for agents to tailor outputs to the person's role, focus, responsibilities, and preferences without becoming local active state.

## Decision

`gtm-setup` should generate this `people/<person-id>.md` template for the setup Person:

```md
# <Display Name>

## Role

<Free-text role>

## Default workspace

<workspace-id>

## Links / sources

<!-- LinkedIn, personal site, GitHub, X/Twitter, calendar/about page, or other user-approved profile/source links. -->

## Focus

<!-- Current GTM focus, segment, territory, motion, or book of business. -->

## Responsibilities

<!-- What this person owns or is expected to do. -->

## Goals

<!-- Quota, pipeline, meetings, expansion, retention, partnerships, launches, or other goals. -->

## Working preferences

<!-- Preferred output style, format, tone, level of detail, approval requirements. -->

## Notes / open questions

<!-- Unknowns agents should not assume. -->
```

Rules:

1. Include the required operational fields: display name, free-text role, and default workspace.
2. Keep the file as shared durable Person context, not local active-state selection.
3. Use it to preserve user-approved personal profile/source links that can support source-assisted setup enrichment.
4. Use it to tailor outputs to the person's role, focus, responsibilities, goals, and working preferences.
5. Leave unknown sections sparse rather than inventing facts.
6. Local active-person selection remains in `~/.gtm/registry.json` or ignored local override files.
7. ADR 0041 defines source-assisted setup enrichment and confirmation before writing enriched durable Person context.
8. ADR 0047 defines how confirmed personal/profile source links are saved in `Links / sources` and which links must not be committed.
9. ADR 0051 defines saved Person source links as starting evidence for later lead research, scoring, and segmentation, not guaranteed truth.

## Consequences

- Agents have a durable place for person-level context.
- Shared team repos can contain many People.
- Each user can keep their active Person selection local while sharing Person records where appropriate.
