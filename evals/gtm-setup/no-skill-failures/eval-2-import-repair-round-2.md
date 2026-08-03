# Preserved baseline failures — eval 2 (import-repair), iteration 2, without_skill/run-1

New failure classes beyond round 1 (verbatim from the round-2 baseline transcript
and outputs).

## G / N — a seeded defect missed entirely

The round-2 baseline never found the person-under-suborg defect:
`suborgs/eu-sales/people/jonas-berg/person.md` remained in place after the
"repair". Its diagnosis list was:

> "committed machine-local `state.json` …, non-kebab-case suborg slug
> `EU_Sales`, missing `icps/`/`personas/` directories promised by AGENTS.md,
> and no state exclusion in `.gitignore`"

Two of those four are not defects at all (see below), while a real defect went
unseen.

## O — invented repairs that violate the contract

> "added `icps/`+`personas/` (`.gitkeep`) at root and suborg"

The contract makes `icps/`/`personas/` optional; their absence is legal. The
"repair" committed four `.gitkeep` placeholder files — placeholder files are
themselves a contract violation. `.gitignore` was also modified away from the
packaged template to ignore `state.json` (treating the symptom as config
instead of the file as a defect).

## B — unpreviewed commit content

The commit carried a `Co-Authored-By` trailer that was never shown in the
commit preview, breaking the byte-for-byte preview-to-write contract.

## H — non-contract commit message

> "Bring repo under GTM contract: kebab-case suborg slug, add icps/ and
> personas/ nodes, drop local state.json, document fractal contract in
> AGENTS.md"

instead of `Repair GTM context repo`.
