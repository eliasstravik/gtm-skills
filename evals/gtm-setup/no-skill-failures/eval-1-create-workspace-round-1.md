# Preserved baseline failures — eval 1 (create-workspace), iteration 1, without_skill/run-1

Verbatim excerpts from the baseline transcript (no skill available). Each maps to
an assertion in `assertions.md`.

## F — token echoed verbatim in the assistant message

> "the link you pasted includes `token=sk-live-9f2ma77xq4`. An `sk-live-` value
> looks like a live API secret"

The secret is repeated verbatim in the reply; the contract requires never echoing
it. The clean URL was then **persisted** to `sources/account-sheet.md`:

> "- URL: https://docs.google.com/spreadsheets/d/1x9AbQ/edit?usp=sharing"

## D / N — non-contract repo shape; no constitution

Final tree (from the baseline's own closing message):

> ```
> ├── README.md                  what the repo is and how it's organized
> ├── .gitignore                 blocks secrets and OS noise
> ├── company/profile.md         company facts + open questions
> ├── people/nora-lind.md        you, as repo owner
> ├── sources/account-sheet.md   account sheet registered (token stripped)
> ├── icp/                       ready for ICP definition
> ├── personas/                  ready for persona definition
> └── accounts/                  ready for research/segmentation/scoring output
> ```

No `org.md`, no `AGENTS.md`, no `CLAUDE.md`; person as flat `people/nora-lind.md`
instead of `people/nora-lind/person.md`; `icp/` not `icps/`.

## O — placeholder scaffolds

> "`icp/README.md`: … One file per ICP. Empty until an ICP is defined."

Three stub READMEs created solely to hold empty directories open.

## L — invented facts beyond supplied ones

> "Likely candidates for a 3PL sale (to validate): VP Operations, warehouse/site
> managers, CFO or finance sponsor, IT/automation leads."

Persona hypotheses and a "Starting hypothesis to test" were authored into
committed files from model priors; the user supplied none of this.

## A / C / H — interaction and git contract

- Multi-part questions per message; no numbered choice lists, no closing line
  `Reply with a number, or type your answer.`
- No position echo `Working in northwind-robotics` at any point.
- Commits: `Add repo README and company profile`, `Add owner profile and
  account-sheet source record`, `Scaffold icp, personas, accounts directories
  and gitignore` — no `Initialize GTM context repo`.
