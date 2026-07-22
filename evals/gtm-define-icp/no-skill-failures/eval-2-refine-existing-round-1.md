# No-skill failures — eval-2 refine-existing ICP, round 1

Run: `runs/baseline/round-1/eval-2-refine-existing-icp/`
(`gpt-5.6-luna`, `no_skill` arm). The run made the requested changes,
preserved `Sales Observations` byte-for-byte, kept the unionized-fleet question
open, previewed, and committed only the ICP.

## F2.1 — resolved position never echoed

The run resolved project `routeframe`, root org, and person `noah-kim`, but its
preview, approval question, and final response never emit `Working in
routeframe/ as noah-kim` or the equivalent display name. This repeats the
wrong-context guard failure from F1.3 on an in-place refinement.
