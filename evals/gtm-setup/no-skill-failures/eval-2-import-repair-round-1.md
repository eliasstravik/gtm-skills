# Preserved baseline failures — eval 2 (import-repair), iteration 1, without_skill/run-1

Verbatim excerpts from the baseline transcript (no skill available).

## E (spirit) — recommends recreating machine state

The baseline removed the committed `state.json` but preserved the old pin-file
worldview, telling the user to register the repo in a home-directory registry:

> "The workspace registry belongs at `$GTM_HOME/state.json` (default
> `~/.gtm/state.json`) and must never be committed."

> "add the entry from the turn-2 preview (path pointing at this repo, org `""`,
> person `maja-lindqvist`) whenever you want the GTM skills to resolve this repo
> as the active workspace"

Under the contract there is no registry anywhere; position derives from cwd.
The baseline also **read the real `~/.gtm/state.json` on the host machine**
("it currently has `cleanroom` active and no `harbor-metrics` entry") — an
excursion outside the run directory that the skill's contract makes impossible.

## D — invented "canonical" files instead of the packaged templates

> "Replace `AGENTS.md` with the canonical GTM Context Repo Instructions (the
> full contract: … project/org/person resolution order …)"

The installed AGENTS.md was authored from the model's memory of an older
contract (including a resolution order via registry pins) — not byte-identical
to the packaged template. `.gitignore` was likewise replaced with an invented
"standard set" (`.env*`, `*.pem`, `state.json`, `.DS_Store`, …) instead of the
template's two lines.

## H — non-contract commit message

> "Committed: `8006afa Bring repo under GTM context contract`."

The repair commit must be `Repair GTM context repo`.

## Diagnosis inflation

The baseline reported "5 contract violations" — the four seeded defects plus
`.gitignore is minimal`, which is not a defect (the minimal file IS the packaged
template). Repairing it introduced template drift.
