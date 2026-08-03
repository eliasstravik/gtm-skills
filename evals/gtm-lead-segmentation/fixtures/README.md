# gtm-lead-segmentation fixtures

Each directory is a pristine GTM context repo source. The harness copies it into a run-local `outputs/` directory, initializes one baseline Git commit with the named fixture person’s identity, and records before/after manifests outside the copy. No fixture contains machine state.

- `one-off-responsibility-beats-title/gridline`: root one-off where responsibility decides between two visible personas.
- `bulk-mixed-persona-routing/veridian`: four leads covering two matches, an explicit disqualifier, and one evidence-gap review.
- `child-persona-override/cloudmason`: child position with a same-stem override and non-colliding inherited persona.
