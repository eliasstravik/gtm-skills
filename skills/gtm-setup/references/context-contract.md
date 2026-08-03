# The GTM context contract

The installable form of this contract is `templates/AGENTS.md`, written verbatim
into every repo root; this file adds what gtm-setup itself needs: the doctor
checklist and source-link safety.

## Repo model

One plain git repo per company. Every org node — root and each `suborgs/<id>/` —
has `org.md`, optional `icps/`, `personas/`, skill-owned files, and nested
`suborgs/<child>/`. Root-only: `AGENTS.md`, `CLAUDE.md` (exactly `@AGENTS.md`),
`.gitignore`, `people/<person-id>/person.md`. Ids lowercase kebab-case; H1 of
`org.md`/`person.md` is the display name; no empty dirs, no placeholder files.
Canonical org paths omit `suborgs/` segments (root = empty path; `cloud/emea` ↔
`suborgs/cloud/suborgs/emea`). Labels are org-qualified: `<org-path>/<file-stem>`,
bare `<file-stem>` at root.

## Derivations — no machine state

- Position = cwd (explicit org in the request overrides for that invocation
  only). Operator = git identity matched against `people/*/person.md` Email
  lines ("as X" overrides per invocation; no match → ask once, conversation
  only). The operator is never the lead or account being worked on.
- Echo `Working in <repo-name>/<org-path> as <person>` before acting (omit
  ` as <person>` when no operator is resolvable and none is needed).
- Durable writes are persist-artifact rituals: preview complete exact content →
  ask approval in the same message → write byte-for-byte → stage only the owned
  file(s) → verify the staged diff → one non-amending commit →
  `git pull --rebase && git push` when a remote exists (no remote: commit only;
  push rejected: rebase and retry, never force). One commit per completed
  artifact — a doctor repair is one artifact.

## Doctor checklist

1. No `state.json`, registry, pin, or other machine-state file anywhere — any
   found is a defect to remove.
2. `AGENTS.md`, `CLAUDE.md`, `.gitignore` byte-identical to the packaged
   templates (`templates/AGENTS.md`, `templates/CLAUDE.md`,
   `templates/gitignore`).
3. Every org node has `org.md`; H1s are display names; ids lowercase
   kebab-case.
4. People only at root `people/<id>/person.md`, each with an `Email` line; a
   person found under a suborg moves to root.
5. No empty directories, placeholder files, caches, or scratch inside the repo.
6. `git config user.name`/`user.email` matches a person in `people/` (report,
   don't repair, when it doesn't — offer to add the person).
7. Repairs follow the persist-artifact ritual and land as one
   `Repair GTM context repo` commit. On a healthy repo report healthy and
   change nothing.

## Source-link safety

Classify every pasted link before recording anything. Safe: plain public or
org-internal URLs without credentials. Unsafe: links carrying `token=`, keys,
signatures, invite codes, or session ids, and local-only paths. Unsafe links
are never persisted to any file (gitignored included), never echoed back —
not even stripped, shortened, or de-tokenized. Record a safe label naming the
source (e.g. "the team's account sheet (Google Sheets)") and advise rotating
the exposed credential. Never open unsafe links.

## Remote wiring

Offer during create and import: a remote is optional (absent remote is the
legal solo case). When the user supplies one, `git remote add origin <url>`
then push; never create remotes or accounts on the user's behalf.
