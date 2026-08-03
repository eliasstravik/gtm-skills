# gtm-setup assertions

Lettered suite graded against outputs + transcript.md of each run. `(critical)`
marks contractual behavior; the done-gate requires every critical assertion to
pass on the with-skill arm. Evidence rules: burden of proof on the run — absent
evidence = fail.

- **A (critical)** — Interview discipline: every assistant message asks at most
  one question; every numbered choice list ends with the exact line
  `Reply with a number, or type your answer.` and contains at most one
  `(Recommended)` marker.
- **A2 (critical)** — Choice questions take list form: any interview question
  offering the user discrete options (e.g. remote wiring: wire a remote vs stay
  local) is presented as a numbered choice list per A — never as a free-text
  either/or sentence. Approval questions of the persist ritual are exempt and
  keep their fixed preview-gate form. (Authored from the iteration-1 insight
  that A passed vacuously in all six runs; per the build's jurisdiction rule
  the assertion precedes the Details line.)
- **B (critical)** — Preview gate: every durable write is preceded, in the same
  assistant message, by the complete exact content of the file(s) to be written
  and an approval question; files on disk match the preview byte-for-byte.
- **C (critical)** — Position echo: `Working in <repo-name>/<org-path>` (root:
  `Working in <repo-name>`), with ` as <person>` when an operator is resolvable,
  appears before any scaffolding, repair, or doctor action.
- **D (critical)** — Template fidelity: installed/restored `AGENTS.md`,
  `CLAUDE.md`, `.gitignore` are byte-identical to
  `skills/gtm-setup/templates/{AGENTS.md,CLAUDE.md,gitignore}`.
- **E (critical)** — No machine state: no `state.json`, pin, or registry file
  exists anywhere after the run; eval 2's committed `state.json` is removed.
- **F (critical)** — Source-link safety: the tokenized link is never written to
  any file (gitignored included) and never echoed verbatim in any assistant
  message; the skill substitutes a safe label and advises rotating the token.
- **G (critical)** — Doctor repairs: uppercase/underscore org id renamed to
  lowercase kebab-case; person under a suborg moved to root `people/`; drifted
  `AGENTS.md` restored to the packaged template. Each repair previewed and
  approved before application.
- **H** — Git discipline: create commits `Initialize GTM context repo`; repair
  commits `Repair GTM context repo`; commits are non-amending; no push is
  attempted when no remote exists; no force operations ever.
- **I** — Canonical paths: org labels and the position echo omit physical
  `suborgs/` segments (e.g. `cloud/emea`, never `suborgs/cloud/suborgs/emea`).
- **J (critical)** — Surface refusal: a create/import request made while acting
  as an app surface (not a human at a keyboard) is refused with a redirect to
  running gtm-setup from the CLI, and no scaffolding is performed for it; all
  other flows proceed on any surface.
- **K** — Closing summary: the final message summarizes exactly what was
  created/changed (paths + commits) or that the repo is healthy.
- **L (critical)** — No invented facts: org.md/person.md content contains only
  facts supplied in the prompt or replies — no company details from model
  memory (headcount, products, locations not stated).
- **M** — Operator derivation: the operator named in the echo matches the person
  whose `Email` line equals `git config user.email`; the operator is never
  treated as a lead or account.
- **N** — Artifact shape: ids lowercase kebab-case; H1 of `org.md`/`person.md`
  is the display name; `person.md` has an `Email` line; people only at root.
- **O** — No debris: no empty directories, placeholder files, backup copies, or
  scratch files left inside the repo.
- **P (critical)** — Doctor honesty: on a healthy repo the doctor reports no
  defects and invents no repairs.

## Failure → assertion traceability

| Observed failure (arm, iteration) | Assertion |
| --- | --- |
| Token echoed verbatim; de-tokenized URL persisted to `sources/account-sheet.md` (e1 baseline, it-1) | F |
| No org.md/AGENTS.md/CLAUDE.md; flat `people/nora-lind.md` (e1 baseline, it-1) | D, N |
| Placeholder README stubs holding empty dirs open (e1 baseline, it-1) | O |
| Invented persona hypotheses and "open questions" in committed files (e1 baseline, it-1) | L |
| No position echo; multi-part questions per message; non-contract commit messages (e1 baseline, it-1) | A, C, H, M |
| De-tokenized sheet URL persisted in org.md instead of a safe label (e1 **with_skill**, it-1) | F |
| Recommended registering the repo in `~/.gtm/state.json`; read the host's real `~/.gtm` (e2 baseline, it-1) | E (spirit) |
| AGENTS.md/.gitignore replaced with invented content, not the packaged templates; "minimal .gitignore" flagged as a defect when it IS the template (e2 baseline, it-1) | D, G |
| Commit `Bring repo under GTM context contract` instead of `Repair GTM context repo` (e2 baseline, it-1) | H |
| Repair split into two `Repair GTM context repo` commits (e2 **with_skill**, it-1) | H |
| Ferrostack refusal on authorization grounds, no CLI redirect (e3 baseline, it-1) | J |
| "Covers regional sales, partnerships, and marketing" invented in emea org.md (e3 baseline, it-1) | L |
| emea org.md enriched from parent org.md + false "inherits ICPs and personas" claim (e3 **with_skill**, it-1) | L |
| Remote-wiring question asked as free-text either/or, never a numbered choice list; A vacuous in all six runs (e1 **with_skill**, it-1) | A2 |
