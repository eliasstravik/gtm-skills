---
name: gtm-setup
description: Triggers when a user wants to create or import a GTM context repo, add a suborg or person to one, validate or repair one, or when another GTM skill cannot resolve its context. Not for defining ICPs or personas, segmenting, scoring, or researching accounts or leads.
---

# GTM Setup

## Switch

| Condition | Action |
| --- | --- |
| Create or import is requested while acting as an app surface, not a human at a keyboard | Refuse and redirect: repo creation needs a keyboard — run gtm-setup from your CLI; perform nothing |
| The user wants a new GTM context repo | Interview, scaffold every root file byte-for-byte from templates/, git-init, commit `Initialize GTM context repo`, offer remote wiring |
| The user has an existing directory to bring under the contract | Inventory it, preview repairs to contract shape, apply approved ones, commit, offer remote wiring |
| The user wants a new suborg | Scaffold `suborgs/<id>/org.md` from templates/ after preview and approval, commit it |
| The user wants a new person | Scaffold `people/<id>/person.md` at root from templates/ after preview and approval, commit it |
| The user asks to validate or repair, or doubts repo health | Run doctor: check the contract, preview repairs, apply approved ones, commit `Repair GTM context repo` |
| Another GTM skill could not resolve context | Diagnose the failed derivation (position, operator, or repo shape), run doctor, report the fix |

## Details

- Present an interview question offering discrete options (remote wiring, flow selection) as a numbered list ending exactly `Reply with a number, or type your answer.`, marking at most one option `(Recommended)`; approval questions keep their preview-gate form.
- Never persist or echo a link carrying a token, secret, or invite — not even stripped or shortened; record a safe label naming the source instead and advise rotating the exposed credential.
- Scaffolded files carry supplied facts only: nothing from model memory, nothing copied up from parent org files, no references to collections that do not exist.
- A repair is one artifact: batch every approved repair into a single non-amending `Repair GTM context repo` commit.
- Read [references/context-contract.md](references/context-contract.md) when validating or repairing a repo or classifying a pasted link; it gives the installable contract, the doctor checklist, and the source-link rules. If unavailable, apply templates/AGENTS.md as the contract source.
- Read [references/setup-flows.md](references/setup-flows.md) when entering any flow; it gives each flow's step order, question forms, and commit discipline. If unavailable, follow the Switch row and the rules above.
