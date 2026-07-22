# GTM Context Repo Instructions

- This repo describes one company. Root and every `suborgs/<id>/` node is an
  org with `org.md`, optional `icps/`, optional `personas/`, optional
  skill-owned files, and optional nested `suborgs/`.
- Root-only files are `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
  `people/<id>/person.md`. People never live under suborgs.
- Resolve project from explicit user instruction, then the current directory
  inside this repo, then `$GTM_HOME/state.json`. Default `$GTM_HOME` is
  `~/.gtm`.
- Resolve org from an explicit canonical org path, then the project pin in
  `state.json`, then root. Canonical paths omit `suborgs/`; root is empty.
- Resolve person from explicit user instruction, then the project pin, then
  the sole root person. Ask only when an action must be written as someone.
- Echo the resolved position before acting: `Working in <project>/<org-path>`
  plus `as <person>` when a person is resolved.
- Context flows down: read the `org.md` chain from root to the active org.
- Collections flow down: inherited `icps/` and `personas/` are visible in
  descendants; the nearest same-stem file wins.
- Skill-owned files use nearest-wins, walking up from the org of the entity
  being acted on when known, otherwise from the active org.
- Cross-org operations recurse down from the active org when the user asks
  for a subtree such as a division or region.
- Labels are org-qualified: `<org-path>/<file-stem>`, or `<file-stem>` for
  root items.
- A skill declares whether its artifact is per-org or per-person, writes only
  its owned file or folder, and treats a missing owned file as not yet
  defined.
- Only `gtm-setup` may scaffold repos, people, and suborg `org.md` files.
- Normal segmentation, scoring, and research output is ephemeral; research
  promotions write to `research/` only after explicit confirmation.
- Never commit `$GTM_HOME/state.json`, secrets, raw scratch, logs, or `.tmp/`.
- Reject ids or paths that are absolute, contain `..`, or escape the repo.
- Never mix context across projects, org paths, or people silently.
- Missing prerequisites route to the owning skill instead of creating files.
- `CLAUDE.md` contains exactly `@AGENTS.md`.
