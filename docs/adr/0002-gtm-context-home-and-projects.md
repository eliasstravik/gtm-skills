# ADR 0002: Store durable GTM context in `~/.gtm` projects

## Status

Accepted

## Context

GTM Skills need durable context that can be reused across skills and sessions: ICPs, personas, scoring models, product/offer context, proof points, disqualifiers, messaging, and instructions for how agents should use that context.

A first proposal placed this context under `.agents/gtm/`, but that mixes two concerns:

- `.agents/` is agent/runtime infrastructure and skill installation context.
- GTM context is the user's commercial operating context and should be controlled independently.

Users may also work across multiple businesses or clients. An agency, consultant, founder with multiple products, or operator working across companies needs separated context spaces.

## Decision

Durable GTM context will live under a user-controlled home directory:

```text
~/.gtm/
  registry.json
  <project-or-company>/
    AGENTS.md
    CLAUDE.md
    gtm.yaml
    organization.md
    business-units/
    teams/
    people/
    workspaces/
      default/
        context.md
```

Each `<project-or-company>` folder is a **GTM Context Project**. It should be usable as a git repository so it can stay local or be pushed to GitHub for team-shared context.

The `~/.gtm` root should include a home-level registry file, `registry.json`, that is richer than a single `.current` pointer. It should store the active project plus metadata such as project aliases, created timestamps, last-used timestamps, and updated timestamps.

`AGENTS.md` is the primary agent-facing instruction file for the context project. `CLAUDE.md` is a compatibility shim containing `@AGENTS.md`, so Claude Code imports the canonical shared instructions from `AGENTS.md`.

The GTM Context Project should contain durable context only. Per-session artifacts such as account research briefs, lead research notes, outreach drafts, campaign artifacts, and one-off recommendations are ephemeral by default and should not be written into the context project unless the user explicitly promotes them into durable context. Organization-level context lives in `organization.md`. Active GTM operating context lives under `workspaces/<workspace>/context.md`. Skill-specific durable files such as `icps.md`, `personas.md`, and `scoring.md` are created in the relevant workspace by the skills that own them rather than by the setup scaffold.

## Consequences

- Users can maintain separate GTM contexts for different companies, clients, or products.
- The context model supports solo local use and team-shared git workflows.
- Skills can rely on a stable place to find durable context without polluting agent installation directories.
- Skills need a promotion rule: task outputs stay ephemeral unless the user asks to save a durable learning into the GTM Context Project.
- The first MVP needs a setup/scaffolding skill that creates or selects a `~/.gtm/<project>` and initializes the standard files.
