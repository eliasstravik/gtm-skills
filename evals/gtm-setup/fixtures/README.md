# gtm-setup fixtures

Pristine, read-only. Every run copies a fixture into its own run directory and
treats the copy as `$GTM_HOME` (or as the external repo path) per the
fixture-isolation convention in the repo CLAUDE.md. All companies and people are
fictional; domains use `.example.com`.

## two-workspaces-home/

A valid `$GTM_HOME` containing two well-formed GTM context repos, no
`state.json`. Used by Load/switch scenarios.

- `bluewater-analytics/` — flat org, one person (`dana-whitfield`).
- `copperline-logistics/` — one suborg (`freight`), one person (`priya-raman`).

## import-broken-repo/

`harbor-metrics/` — a handed-over context repo with deliberate defects, used by
Import+repair scenarios. Defects:

1. `AGENTS.md` missing (hard doctor requirement).
2. `CLAUDE.md` content is not exactly `@AGENTS.md`.
3. `.gitignore` missing.
4. `state.json` committed inside the repo (local state must never be committed).
5. `suborgs/EU_Sales/` — id not lowercase kebab-case.
6. `suborgs/marine/` — has `notes.md` but no `org.md`.
7. `suborgs/marine/people/jonas-berg/person.md` — person under a suborg
   (people are root-only).

Runtime-added defects (git cannot store them; the run prompt's prep step adds
them to the copy): an empty `drafts/` directory, and `git init` + initial commit
so the copy behaves like a real handed-over repo.
