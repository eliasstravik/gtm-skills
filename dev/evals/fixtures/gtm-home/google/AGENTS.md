# GTM Context Repo Instructions

- Root and every `suborgs/<id>/` node is an org with `org.md`, optional
  `icps/`, optional `personas/`, optional skill-owned files, and optional nested
  `suborgs/`.
- Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
  `people/<id>/person.md`.
- Resolve project from explicit instruction, then current directory inside this
  repo, then `$GTM_HOME/state.json`.
- Resolve org from explicit canonical org path, then state pin, then root.
- Context and collections flow down; nearest same-stem file wins.
- Labels are org-qualified and omit physical `suborgs/` segments.
- Only `gtm-setup` may scaffold identity files.
- Never commit local state, secrets, raw scratch, logs, or `.tmp/`.
