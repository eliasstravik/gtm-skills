# No-skill failures — eval-1 create-workspace, round 1

Run: `runs/baseline/round-1/eval-1-create-workspace/` (claude-fable-5, no_skill
arm). The baseline was diligent (flagged the secret token, separated internal
material, consumed all replies in order) but produced a workspace no GTM skill
could consume — the strongest prove-need evidence so far.

## F1.1 — invented workspace shape; fractal contract absent [critical]

Instead of one context repo per company (root `org.md`, `AGENTS.md`,
`CLAUDE.md` = `@AGENTS.md`, `.gitignore`, `people/<id>/person.md`,
`suborgs/<id>/`), the baseline wrote, verbatim (full output tree):

```text
gtm-home/workspace.json
gtm-home/README.md
gtm-home/companies/meridian-solar/profile.json
gtm-home/companies/meridian-solar/profile.md
gtm-home/companies/meridian-solar/internal/resources.md
gtm-home/companies/meridian-solar/people/elias-stravik.md
```

A multi-company store rooted at `$GTM_HOME` with a `workspace.json` manifest
and dual md+json profiles. Zero contract files exist; every downstream skill's
context resolution fails.

## F1.2 — no `$GTM_HOME/state.json`; active context unrecorded [critical]

Nothing registers the project or pins org/person. The baseline put discovery
inside its own `workspace.json` ("entry point: companies list, paths, owner,
default company") — a mechanism no other GTM skill reads.

## F1.3 — private/tokenized link persisted instead of safe-labeled

The token was stripped (good), but the private pricing-sheet URL was still
committed to the workspace, verbatim:

> - Google Sheet: https://docs.google.com/spreadsheets/d/PRIV-8821/edit?usp=sharing

Contract: secret-bearing/tokenized links are never committed and at most
become safe labels (e.g. `internal pricing sheet — ask owner`).

## F1.4 — durable write approved from a summary, not full file contents

Question 5 asked to write from a one-line file list ("a README with
conventions…, a machine-readable `workspace.json` manifest, …"). The contract
requires the complete content of every file inline before approval.

## F1.5 — guessed a fact from session memory

Transcript decision 4, verbatim: "**Owner email:** Used elias@prospecterra.com
from session context for the workspace owner/people record; no scripted reply
covered email, noted here as an inference." Contract: never guess missing
facts from memory, email domains, or prior conversations.

## F1.6 — no git init / `Initialize GTM context repo` commit

The workspace was left as a plain directory; contract initializes git by
default and commits setup-owned files.

## Recurring (already preserved in eval-2 record)

- No `Working in <project>/<org-path>` echo (F2.2).
- Closing summary omits collection status and next-skill recommendation
  (F2.4).
