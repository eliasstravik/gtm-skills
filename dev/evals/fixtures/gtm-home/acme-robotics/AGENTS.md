# GTM Context Project Instructions

Resolve GTM context from the prompt, then the current directory, then
`$GTM_HOME/registry.json`. Active local state belongs in the registry, not in
committed files.

Before any GTM skill reads, writes, stages, or commits project files,
canonicalize the project root. IDs inside a project must be lowercase slug ids.
Reject derived child paths that are absolute, contain `..`, or resolve outside
the project root, including symlink escapes.

Skill-owned workspace files:

- `gtm-define-icp` owns `icps.md`.
- `gtm-define-personas` owns `personas.md`.
- `gtm-account-scoring` owns `account-scoring.md`.
- `gtm-lead-scoring` owns `lead-scoring.md`.

Before fetching or printing saved source links, classify them when the setup
classifier is available. Never fetch or print secret-bearing, tokenized, invite,
local-only, or private-tunnel URLs; use redacted safe labels instead.
