# ADR 0004: Use a small durable file set for MVP GTM Context Projects

> Superseded by [ADR 0011](0011-gtm-setup-scaffolds-only-core-project-files.md) and then [ADR 0012](0012-organization-repo-with-gtm-workspaces.md). The setup scaffold now creates organization/workspace structure; skill-owned files are created by their owning skills inside the relevant workspace.

## Status

Superseded by ADR 0011

## Context

A GTM Context Project should give skills and agents enough durable context to work across sessions without turning into an artifact dump. The MVP needs the smallest file structure that supports SDR/BDR workflows: context setup, ICP definition, persona definition, account scoring, lead scoring, account research, lead research, and outbound composition.

Per-session outputs such as account briefs, lead notes, outreach drafts, and campaign artifacts should remain ephemeral by default.

## Decision

The MVP GTM Context Project file shape is:

```text
~/.gtm/<project>/
  .git/
  AGENTS.md
  CLAUDE.md
  context.md
  icps.md
  personas.md
  scoring.md
```

File responsibilities:

- `AGENTS.md` — primary agent-facing instructions for how to use the context project.
- `CLAUDE.md` — compatibility shim containing `@AGENTS.md`, so Claude Code imports the canonical shared instructions from `AGENTS.md`.
- `context.md` — company, product, offer, sales motion, proof points, positioning, messaging, and disqualifiers.
- `icps.md` — ideal account segments.
- `personas.md` — ideal people inside the ICPs.
- `scoring.md` — account scoring and lead scoring models.

The MVP should not create durable `accounts/`, `leads/`, `campaigns/`, `sequences/`, `research/`, or `outputs/` directories by default.

## Consequences

- The context repo stays focused on reusable context rather than session outputs.
- Skills have clear places to read and update durable GTM knowledge.
- Later versions can add new files or folders only after real usage shows a durable need.
- Skills must distinguish between ephemeral artifacts and promoted durable learnings.
