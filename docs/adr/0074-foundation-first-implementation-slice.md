# ADR 0074: Build the MVP foundation slice first

## Status

Accepted

## Context

The MVP bundle includes both context-foundation skills and downstream GTM workflow skills: setup, ICP/persona definition, account/lead research, segmentation, and scoring.

Downstream skills depend on a shared understanding of where GTM context lives, how the active project/person/workspace is resolved, how skill-owned files are scoped, and how metadata is validated. If workflow skills are implemented first, each one is likely to invent its own assumptions about context resolution, file paths, templates, and safety behavior.

## Decision

The first implementation slice should be foundation-first.

Build the smallest foundation that every MVP skill depends on before building downstream GTM workflow skills:

1. `gtm-setup`.
2. `~/.gtm/registry.json` handling.
3. GTM Context Repository scaffold generation.
4. Organization/person/workspace/context resolution rules.
5. Skill metadata and structure validation.
6. Templates for `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `gtm.yaml`, `organization.md`, `people/<person>.md`, and `workspaces/<workspace>/context.md`.

The foundation slice should not attempt to implement the full research/scoring/segmentation workflow. It should make those later skills straightforward and consistent.

## Consequences

- Later MVP skills share one context resolver and scaffold contract.
- The repo avoids duplicating path, registry, workspace, and template assumptions across skills.
- The first build milestone may feel less flashy than account research, but it reduces rework and makes the rest of the MVP easier to test.
- The first shippable demo should verify setup and context resolution before layering research/scoring workflows on top.
