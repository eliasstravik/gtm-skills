# gtm-define-personas — iteration 3 results (done-gate evidence)

Date: 2026-07-22. Executor model: gpt-5.6-luna. Grader model:
gpt-5.6-terra. Generated runs, gradings, benchmark, and viewer inputs live in
the gitignored `skills/gtm-define-personas-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| create-first-persona | 15/15 | 6/15 |
| refine-existing-persona | 15/15 | 11/15 |
| altitude-mismatch | 15/15 | 8/15 |
| **Pass rate** | **100.0%** | **55.5%** (delta **+0.44**) |

- Every critical and noncritical assertion passed in all three accepted
  with-skill runs; all no-skill arms were contamination-free.
- The skill adds about 25.2 seconds and 21,284 tokens per run while eliminating
  unstable schemas, incomplete approval/provenance reports, and incorrect child
  labels.
- Iteration 1 exposed child constraint and rephrased-question handling.
  Iteration 2 fixed that but surfaced an outer-workspace Git-anchor regression
  and an assertion conflict between inherited context and exact refinements.
  Iteration 3 resolves both.
- Safety audits verify unchanged `state.json`, no explicit `~/.gtm` command
  access, clean intended context repositories, and single-file task commits.
- The skill-creator viewer was generated with iteration-2 comparison context,
  rendered as a 150,811-byte static artifact, served privately through
  Tailscale, and verified locally and through its private HTTPS route. The
  client explicitly waived per-skill review gates; the clean self-review is
  therefore accepted as empty feedback.
