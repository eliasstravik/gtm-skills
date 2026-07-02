# ADR 0023: `gtm-setup` asks a setup-depth question

## Status

Superseded by [ADR 0081](0081-gtm-setup-fast-path-interaction-budget.md): the depth question is no longer asked; setup defaults to the simple chain silently, and the depth options below survive as opt-in behavior when the user names a business unit or team.

## Context

GTM Context Projects need to support both simple organizations and enterprise contexts. Business Units and Teams are optional, but setup needs a lightweight way to know whether to create them for the user's initial full context chain.

Without a setup-depth question, setup either over-models small companies or under-models enterprise users who know they belong to a specific Business Unit or Team.

## Decision

`gtm-setup` asks one setup-depth question after collecting Organization and Person basics:

> Do you need to model a specific business unit or team, or is this a simple/default workspace?

Recommended options:

1. Simple/default workspace
2. Add business unit
3. Add business unit + team
4. Add team only

Behavior:

- **Simple/default workspace:** create Organization → Person → GTM Workspace.
- **Add business unit:** create Organization → Business Unit → Person → GTM Workspace.
- **Add business unit + team:** create Organization → Business Unit → Team → Person → GTM Workspace.
- **Add team only:** create Organization → Team → Person → GTM Workspace.

The created Business Unit and/or Team should be referenced in `gtm.yaml` and corresponding markdown files should be created only when selected.

The resulting workspace ID should be generated from the most specific available context, shown to the user, and overridable before files are written.

ADR 0040 defines the generated templates for selected Business Unit and Team files.

## Consequences

- Small-company setup stays fast.
- Enterprise users can represent their actual context chain during setup.
- The model stays standardized while avoiding mandatory hierarchy.
