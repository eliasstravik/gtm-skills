# Eval 3 — altitude-mismatch baseline failures, iteration 4

Source: accepted fresh `gpt-5.6-terra` without-skill run. The full transcript remains in the gitignored workspace; the failing evidence below is preserved verbatim.

## Ownership explanation omits the exact visible ICP label

The baseline offered only this pre-confirmation explanation:

> The evidence places this persona in `suborgs/public-sector`, with the requested ICP, medium-confidence Maya source, and central-IT approval constraint.

It did not name `public-sector/government-benefits-agencies`, did not emit the root working-position line, and did not echo the corrected position after confirmation.

## Child persona contract is missing

The preview's Identity was:

> ## Identity
>
> - ID: `benefits-program-director`
> - ICP: `public-sector/government-benefits-agencies`
> - Product: Caseworker Enablement

It omitted `Display name`, the child-qualified persona label `public-sector/benefits-program-director`, and the fixed ten-H2 schema. The run ended without a final handoff:

> The approved persona now exists only under the public-sector suborg. I’m performing a final content and repository-status check.

The file remained untracked and the copied repo retained only the fixture-baseline commit.
