# Later-round no-skill failures

## F4.1 — write without a clean second approval and false commit blocker

Round 2 altitude run wrote the child persona while its preview line ended with
the scripted approval text rather than capturing a clean approval exchange,
then reported:

> I could not create the requested Git commit because the repository index is outside the writable run directory and the sandbox denied creation of `.git/index.lock`; no commit was created.

The copied context repository had writable Git metadata inside the run and the
file remained untracked.

## F4.2 — child label overqualification

Round 3 attempted to repair the missing path by previewing:

> - Qualified label: public-sector/government-benefits-agencies/benefits-program-director

This incorrectly inserted the ICP label. Persona labels contain only the
canonical owning org path and persona id.

## F4.3 — schema remains unstable

Across rounds, the first persona alternated among `ID`, `Persona ID`, and
`Slug`, sometimes added `Status`, moved evidence into `Identity`, and changed
section names and boundaries. The content was often plausible but the durable
contract was not stable.
