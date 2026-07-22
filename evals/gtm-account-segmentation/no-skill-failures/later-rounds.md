# No-skill failures — later rounds

Rounds 2 and 3 were fresh `gpt-5.6-luna` runs. Round 3 produced no new failure
class after round 2, satisfying the baseline saturation rule.

## F4 — ICP maintenance review was confused with account review

In both later rounds, the no-skill classifier mechanically carried general ICP
maintenance notes into account-level `needs_review`. For Helix Metals it said:

> Confidence: medium
> needs_review: true

even though the account is well inside the stated range and matches every
required signal. In bulk, this inflated the review-needed count to three and
marked both unambiguous matches for review:

> review-needed: 3

The same error appeared for Baltic Ledger. The skill therefore needs an explicit
separation between account-evidence ambiguity and the ICP file's general
`Review Needs` backlog.
