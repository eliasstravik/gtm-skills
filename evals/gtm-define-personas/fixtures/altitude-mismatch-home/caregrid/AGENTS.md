# GTM Context Repo Instructions

- This repo describes one company. Root and every `suborgs/<id>/` node is an
  org with `org.md`, optional `icps/`, `personas/`, and nested `suborgs/`.
- Root-only files: `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
  `people/<id>/person.md`. People never live under suborgs.
- Canonical org paths omit `suborgs/`; root is the empty path.
- Local machine state lives only in `$GTM_HOME/state.json`, never committed.
- Never commit secrets, raw scratch, logs, or `.tmp/`.
