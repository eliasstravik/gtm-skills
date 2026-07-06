# GTM Context Repo Instructions

- This repo describes one company. Root and every `suborgs/<id>/` node is an
  org with `org.md`, optional `icps/`, optional `personas/`, optional
  skill-owned files, and optional nested `suborgs/`.
- Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
  `people/<id>/person.md`. People never live under suborgs.
- Resolve project from explicit user instruction, then current directory inside
  this repo, then `$GTM_HOME/state.json`. Default `$GTM_HOME` is `~/.gtm`.
- Resolve org from explicit canonical org path, then the project pin in
  `state.json`, then root. Canonical paths omit `suborgs/`; root is empty.
- Context and collections flow down; nearest same-stem ICP/persona file wins.
- Labels are org-qualified: `<org-path>/<file-stem>`, or just `<file-stem>` for
  root items.
- Only `gtm-setup` may scaffold repos, people, and suborg `org.md` files.
- Never commit `$GTM_HOME/state.json`, secrets, raw scratch, logs, or `.tmp/`.
