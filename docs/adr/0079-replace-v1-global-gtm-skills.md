# ADR 0079: Replace the v1 global GTM skills without migration

## Status

Accepted

## Context

A prior generation of GTM skills is installed globally at `~/.claude/skills/`: `setup`, `icp`, `persona`, `account-research`, `account-scoring`, `lead-research`, and `lead-scoring`. They use a project-local `.gtm/<company-slug>/` context store with a `.info` YAML file and a flat `tags:` metadata block — contradicting ADR 0002 (`~/.gtm` context home), ADR 0003 (`registry.json`), ADR 0010 (metadata contract), ADR 0012 (workspace model), and ADR 0013 (`gtm.yaml`).

If both generations are installed at once, agents will co-trigger conflicting skills and produce two incompatible context stores on the same machine.

## Decision

The v1 global GTM skills are a dead prior iteration. This repository replaces them outright.

- No migration tooling is built for v1 `.gtm/<company-slug>/` contexts in the MVP.
- All new skills ship under non-colliding `gtm-`-prefixed names (ADR 0083), so the two generations never share a trigger surface.
- Uninstalling the v1 skills from `~/.claude/skills/` is an explicit tracked task, executed once the new foundation slice (`gtm-setup` and its evals) lands, so the machine is never left without a working setup path.

## Consequences

- The new build starts clean; no compatibility constraints leak from v1 into the ADR architecture.
- Until the uninstall task executes, v1 skills remain installed; sessions building the new skills should not invoke them.
- If real customer context is ever discovered in a v1 `.gtm/` folder, this decision must be revisited before the uninstall executes.
