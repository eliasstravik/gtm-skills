# gtm-setup — assertion suite (draft)

One checkable assertion per required behavior; failure-derived assertions are
added below as baseline rounds are judged. **(critical)** marks severe or
contractual assertions per skill-issue.

## Common (all flows)

- **A1 (critical)** — No file is written outside the run's `$GTM_HOME` copy
  (plus the given external repo path for import); `~/.gtm` untouched.
- **A2 (critical)** — Machine state is recorded at `$GTM_HOME/state.json` in the
  contract shape (`active`, `projects.<id>.{path,org,person}`), and `state.json`
  is never committed inside a context repo.
- **A3** — Exactly one question per message; choice questions use an inline
  numbered list ending `Reply with a number, or type your answer.`; at most one
  `(Recommended)` marker.
- **A4 (critical)** — Every durable write is preceded, in the same message, by
  the complete file content previewed inline plus an approve/iterate question;
  nothing is written before approval.
- **A5 (critical)** — Resolved position echoed as `Working in
  <project>/<org-path>` (plus `as <person>` when resolved); the person may be
  rendered as the id or the person.md H1 display name.
- **A6** — Flow ends with a setup summary: project, org path, person,
  created/preserved/repaired/skipped files, source-link handling, git status,
  open questions; recommends `gtm-define-icp`/`gtm-define-personas` only when
  those collections are absent.
- **A7 (critical)** — No fact is guessed from session memory, environment, or
  email domains; anything the user didn't supply becomes an open question or a
  question to the user.

## Create flow (eval 1)

- **C1 (critical)** — Root contains exactly the setup-owned files: `org.md`,
  `AGENTS.md`, `CLAUDE.md`, `.gitignore`, `people/<person-id>/person.md`; root
  `CLAUDE.md` contains exactly `@AGENTS.md`.
- **C2 (critical)** — No `icps/`, `personas/`, scoring/research files, empty
  directories, placeholder files, or default suborg are created.
- **C3** — `org.md` opens with the display-name H1 and `Background` as the first
  section; `person.md` opens with the person H1 and role.
- **C4 (critical)** — The tokenized private link is never persisted anywhere
  in the workspace (gitignored files included) and never printed back
  verbatim; it appears at most as a safe label.
- **C5** — The new repo is `git init`ed with a single commit `Initialize GTM
  context repo` containing only setup-owned files.
- **C6** — All generated ids are lowercase kebab-case (`meridian-solar`,
  `elias-stravik`).
- **C7** — Facts not supplied by the user become open questions, not invented
  content (no hallucinated research under a no-network run).

## Load/switch flow (eval 2)

- **L1 (critical)** — Pin *values* are exactly `active: copperline-logistics`,
  org `freight` in canonical form (never `suborgs/freight`), person
  `priya-raman`; schema-shape errors are graded under A2 only.
- **L2 (critical)** — No file inside either workspace repo is modified.
- **L3** — Position echoed: `Working in copperline-logistics/freight as
  priya-raman` (equivalent wording acceptable, content exact).
- **L4** — Overview covers orgs (root + freight), people, whether `icps/` and
  `personas/` exist, and the natural next GTM skill.

## Import/repair flow (eval 3)

- **I1 (critical)** — All eight defects are detected and reported: missing
  `AGENTS.md`, wrong `CLAUDE.md` content, missing `.gitignore`, committed
  `state.json`, non-kebab `EU_Sales`, `marine` missing `org.md`, person under a
  suborg, empty `drafts/` directory.
- **I2 (critical)** — Repairs are previewed with full file contents and the
  change purpose before writing, and applied only after approval.
- **I3 (critical)** — The repo is copied into `$GTM_HOME/harbor-metrics` with
  git history intact (the `handoff` commit remains in the log).
- **I4** — Repairs are committed as `Repair GTM context repo`.
- **I5 (critical)** — The committed `state.json` is removed from the repo;
  machine state is written to `$GTM_HOME/state.json` instead.
- **I6** — Shape defects are actually fixed or explicitly left open with the
  user's approval: `EU_Sales` → kebab id, `marine` gets `org.md`, `jonas-berg`
  moves to root `people/`, empty `drafts/` removed.
- **I7** — The project is registered in `state.json` with a canonical org pin;
  because the repair moves `jonas-berg` to root, two root people exist, so the
  person pin requires one numbered-list question (a consumed reply accepting
  the recommended option passes); position echoed.

## Traceability — preserved failures → assertions

Round 1 (`no-skill-failures/*-round-1.md`):

| Failure | Assertion(s) |
| --- | --- |
| F1.1 invented workspace shape | C1, C2 |
| F1.2 no state.json | A2 |
| F1.3 private link persisted | C4 |
| F1.4 write approved from summary | A4 |
| F1.5 email guessed from session memory | A7 (added from this failure) |
| F1.6 no git init/commit | C5 |
| F2.1 invented state schema | A2 |
| F2.2 no position echo | A5 |
| F2.3 no numbered-list choice | A3 |
| F2.4 overview omits collections/next skill | A6, L4 |
| F3.1 missing AGENTS.md undetected | I1 |
| F3.2 CLAUDE.md not `@AGENTS.md` | I1, I6 |
| F3.3 missing .gitignore undetected | I1 |
| F3.4 person under suborg normalized | I6 |
| F3.5 empty dir kept via `.gitkeep` | I6 |
| F3.6 wrong org pin / unpinned person | I7 |
| F3.7 repairs approved from one-liners | I2 |
| F3.8 off-contract repair commit message | I4 |
