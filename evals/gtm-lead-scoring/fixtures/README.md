# gtm-lead-scoring fixtures

Each directory is a pristine GTM context repo source reused from the accepted Task 7 persona contexts. The harness copies it into a run-local `outputs/` directory, initializes one baseline Git commit with the named fixture person’s identity, and records before/after manifests outside the copy. No fixture contains machine state, a scoring file, or a rubric.

- `one-off-strong-fit/gridline`: root one-off with complete evidence across persona responsibilities, buying role, and pains.
- `bulk-all-bands/veridian`: four leads spanning all four qualitative Bands, including one disqualifier cap and one missing-facts review.
- `child-persona-precedence/cloudmason`: child position with a same-stem persona override and non-colliding visible personas.
