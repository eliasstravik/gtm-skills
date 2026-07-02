# ADR 0017: `gtm-setup` scaffolds `.gitignore`

## Status

Accepted

## Context

GTM Context Projects are intended to be git repositories that can be shared across a team. Shared repos should contain durable GTM context only. User-specific active state and ephemeral research/output artifacts must not be committed.

The primary local active state lives outside the repo in `~/.gtm/registry.json`, but agents and users may still create temporary local files while working inside a context repo.

## Decision

`gtm-setup` must create or update a project-level `.gitignore` with guardrails for local state, ephemeral outputs, temporary files, and secrets.

Recommended MVP `.gitignore`:

```gitignore
# Local GTM state; active person/workspace must not be committed
.gtm.local.json
.gtm.local.yaml
.local/

# Ephemeral outputs/artifacts
outputs/
research/
tmp/
*.tmp

# Secrets/env
.env
.env.*
```

Rules:

1. `~/.gtm/registry.json` remains the default home for Local GTM State.
2. If a local per-repo override is ever needed, it must use ignored filenames such as `.gtm.local.json` or `.gtm.local.yaml`.
3. Research, account briefs, lead notes, outreach drafts, and batch outputs are ephemeral by default and should not be committed unless explicitly promoted into durable context.
4. Secrets and environment files must never be committed.
5. `gtm-setup` should merge these ignore rules without deleting user-defined ignore rules.

## Consequences

- Shared context repositories are safer for teams.
- Accidental active-person/workspace commits are less likely.
- The setup scaffold has one more file, but the safety benefit is worth it.
