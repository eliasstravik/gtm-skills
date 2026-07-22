# No-skill failures — rounds 1–3

Fresh `gpt-5.6-luna` runs with every skill forbidden.

## F1 — output contract and context metadata were unstable

Correct numeric answers routinely omitted the working-position line, canonical
org metadata, full source chain, supplied segment label, or record-level fields.
The child result often collapsed provenance to “EMEA child rubric” rather than
reporting both root and child paths.

## F2 — evidence score was confused with review status

All three bulk rounds marked Kestrel Commerce review-needed solely because its
rubric input was `single supplied source`, even though that deliberate rating was
already priced into the score and no scoring input was missing or conflicting.

## F3 — ephemeral scoring created a report artifact

Round 1 child scoring wrote `outputs/baltic-ledger-score.md` and linked to it,
despite the read-only response-only contract. The behavior recurred in later
rounds.

## F4 — complete ratings were contradicted by invented gaps

Round 3 scored Helix from explicit complete component ratings, then invented
open questions about employee/site counts, warehouse, analytics workflow, and
timing. Those claims contradict the instruction to treat component inputs as
supplied facts for scoring.
