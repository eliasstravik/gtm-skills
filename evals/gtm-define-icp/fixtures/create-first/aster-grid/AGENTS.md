# GTM Context Repo

This repository is a fractal GTM context repo: the durable shared memory for one
company's go-to-market work. Humans and agents on any surface read and write it
under the rules below. `CLAUDE.md` contains exactly `@AGENTS.md` so every agent
surface loads this file.

## Repo model

- Every org node — the repo root and each `suborgs/<id>/` — has `org.md`, optional
  `icps/`, optional `personas/`, optional skill-owned files, and optional nested
  `suborgs/<child>/`.
- Root-only files: `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
  `people/<person-id>/person.md`. People never live under suborgs.
- Ids are lowercase kebab-case. The H1 of `org.md` and `person.md` is the display
  name. No empty directories, no placeholder files.
- Canonical org paths omit the physical `suborgs/` segments: the root org is the
  empty path; `cloud/emea` refers to `suborgs/cloud/suborgs/emea`.
- Labels are org-qualified: `<org-path>/<file-stem>`, bare `<file-stem>` at root.

## Position and operator — no machine state

- This repo carries no machine state: no state file, no registry, no pins. A
  `state.json` found anywhere in it is a defect; gtm-setup's doctor removes it.
- Position is derived from the current working directory: standing at the repo
  root means the root org; standing in `suborgs/cloud/suborgs/emea` means org
  `cloud/emea`. An explicit org named in a request overrides position for that
  invocation only — nothing is sticky.
- The operator is derived from git identity: match `git config user.name` and
  `user.email` against `people/<id>/person.md` (the `Email` line is the primary
  key). An explicit "as X" in a request overrides per invocation. No match: ask
  once; the answer lives only in that conversation. The operator is never the
  lead or account being worked on.
- Before acting, every skill echoes position: `Working in <repo-name>/<org-path>
  as <person>` (omit ` as <person>` when no operator is resolvable and none is
  needed).

## Inheritance — context flows down

- Read the `org.md` chain from root to the active org.
- Collections (`icps/`, `personas/`) flow down; the nearest same-stem file wins
  on collision; non-colliding inherited files remain visible.
- Skill-owned per-org files resolve nearest-wins walking up from the org of the
  entity being acted on.

## Writes

- Durable writes are persist-artifact rituals: preview the complete exact
  content, ask approval in the same message, write byte-for-byte, stage only the
  owned file(s), verify the staged diff, make one non-amending commit, then
  `git pull --rebase && git push` when a remote exists (no remote: commit only;
  push rejection: rebase and retry, never force). One commit per completed
  artifact.
- Segmentation, scoring, and non-promoted research output are ephemeral:
  response-only, never written to any file, ending with an explicit
  no-side-effects statement.
- Each skill declares whether its artifact is per-org or per-person, writes only
  its owned file or folder, and treats a missing owned file as not yet defined.
- Only gtm-setup scaffolds repos, people, and suborg `org.md` files.
- Nothing durable lives outside this repo: no notes files, no caches, no scratch.
