# gtm-account-scoring — iteration 3 results (done-gate evidence)

Date: 2026-07-22. Executor: gpt-5.6-luna. Grader: gpt-5.6-terra.
Generated evidence lives in the gitignored
`skills/gtm-account-scoring-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-root-exact-score | 10/10 | 6/10 |
| bulk-mixed-ranking | 11/11 | 5/11 |
| child-nearest-rubric | 11/11 | 6/11 |
| **Mean pass rate** | **100.0%** | **53.3%** (delta **+0.47**) |

- Every assertion passed in all accepted with-skill runs; all baselines were
  contamination-free.
- Iteration 1 exposed incorrect `no-match` component mapping and an incomplete
  child transcript. Iteration 2 fixed both but omitted per-record open questions
  in bulk. Iteration 3 resolves all failures.
- Safety audits verify unchanged state/context/Git, no `~/.gtm` access, and no
  persisted score artifact in accepted with-skill runs.
- The skill-creator viewer was generated, served privately through Tailscale,
  and verified locally and through the private HTTPS route. The client waived
  per-skill gates; clean self-review is accepted as empty feedback.
