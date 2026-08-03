# gtm-setup fixtures

Committed fixtures are pristine and read-only; every run copies its fixture into
`<run-dir>/outputs/<repo-name>/`, git-inits the copy, sets the fixture person's
git identity, commits everything (dotfiles included) as `fixture baseline`, and
operates with the copy as cwd. No fixture has a nested `.git`. Runs never touch
any real context repo.

## Eval 1 — create-workspace: no fixture

Create starts from a truly empty directory, so eval 1 has no fixture. Run prep
instead creates `<run-dir>/outputs/northwind-robotics/` empty and writes
`<run-dir>/gitconfig` with the operator identity (Nora Lind /
nora@northwindrobotics.com), exported as `GIT_CONFIG_GLOBAL` so operator
derivation from git identity works before any repo-local config exists.

## `import-broken-repo/harbor-metrics/` — deliberately defective (eval 2)

This fixture intentionally violates the context contract; the defects are the
test substance for the doctor/repair flow:

1. `state.json` committed at root — machine state is banned everywhere.
2. `suborgs/EU_Sales/` — uppercase/underscore id; must become kebab-case
   `eu-sales`.
3. `suborgs/EU_Sales/people/jonas-berg/person.md` — people never live under
   suborgs; must move to root `people/`.
4. `AGENTS.md` drifted from the packaged template — must be restored
   byte-identical to `skills/gtm-setup/templates/AGENTS.md`.

`CLAUDE.md` and `.gitignore` are healthy copies of the packaged templates;
`people/maja-lindqvist/person.md` is the root person whose identity run prep
sets as git identity.

## `healthy-two-level/cloudmason/` — pristine (eval 3)

Contract-shaped two-level repo: root org `Cloudmason` with `AGENTS.md`,
`CLAUDE.md`, `.gitignore` byte-identical to `skills/gtm-setup/templates/`,
root person `elin-sund`, and one suborg `cloud`. Eval 3 runs with cwd
`suborgs/cloud/` to exercise position-from-cwd, adds an `emea` suborg under it
(physical `suborgs/cloud/suborgs/emea/`, canonical `cloud/emea`), then runs a
doctor pass that must find nothing, then probes the chat-surface refusal row.
