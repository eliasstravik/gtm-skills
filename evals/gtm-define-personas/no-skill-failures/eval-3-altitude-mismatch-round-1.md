# Eval 3 — altitude-mismatch baseline failures, round 1

Source: ignored fresh no-skill run
`runs/baseline/round-1/eval-3-altitude-mismatch/` using gpt-5.6-luna.

## F3.1 — child qualified label omits the canonical org path

The run placed the file correctly but previewed:

> - Qualified label: benefits-program-director

The required label is `public-sector/benefits-program-director`.

## F3.2 — confirmed altitude is not echoed canonically

After confirmation the run said:

> Confirmed. I’m placing the persona under `suborgs/public-sector/personas/`, keeping the government-benefits-agencies evidence boundary, and preserving the central-IT pilot-approval question as open.

It never emitted `Working in caregrid/public-sector as maya-chen` or the full
source-path report.

## F3.3 — approval and final reports are incomplete

The approval message omitted target purpose and explicit no-external-side-
effects language. The final response omitted the qualified label, sources,
altitude evidence, open-question text, and downstream recommendation.
