# ADR 0038: Use a standard generated `.gitignore` template

## Status

Accepted

## Context

GTM Context Projects are git repositories by default. They contain durable shared context, while local active state, personal overrides, secrets, temporary artifacts, and per-session research/output files must stay out of commits.

ADR 0028 makes the initial setup commit automatic by default. ADR 0036 makes setup idempotent and non-destructive. Therefore `gtm-setup` needs a standard `.gitignore` template that protects local and ephemeral files while preserving any user-authored ignore rules on later setup/repair runs.

## Decision

`gtm-setup` should generate this `.gitignore` template:

```gitignore
# Local GTM state
.gtm.local.json
.gtm.local.yaml
.local/
CLAUDE.local.md

# Secrets
.env
.env.*
*.pem
*.key

# Ephemeral outputs
outputs/
research/
tmp/
*.tmp
*.log

# OS/editor noise
.DS_Store
```

Rules:

1. `~/.gtm/registry.json` is outside the repo and should not be committed.
2. Repo-local override files such as `.gtm.local.json`, `.gtm.local.yaml`, `.local/`, and `CLAUDE.local.md` must be ignored.
3. Secrets and environment files must be ignored.
4. Per-session outputs such as raw research, temporary files, logs, and generated output folders are ephemeral by default and must be ignored.
5. Durable learnings should be promoted into `organization.md`, `people/*.md`, `workspaces/<workspace>/context.md`, or skill-owned workspace files instead of committed as raw outputs.
6. On idempotent setup/repair runs, merge missing ignore rules without deleting user-authored rules.

## Consequences

- The default initial commit excludes local state, secrets, and ephemeral outputs.
- Users have a safe place for local overrides without polluting shared context.
- Raw research/output artifacts remain ephemeral unless deliberately promoted into durable context.
- Repair mode can safely add missing ignore rules without overwriting custom project ignores.

ADR 0047 defines that secret-bearing, signed, invite, or unapproved sensitive source links must not be committed even if they do not match `.gitignore` patterns. ADR 0048 defines the source-link classification policy.
