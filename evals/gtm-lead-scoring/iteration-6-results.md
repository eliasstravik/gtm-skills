# gtm-lead-scoring — iteration 6 results (done-gate evidence)

Date: 2026-07-22. Executor: gpt-5.6-luna. Grader: gpt-5.6-terra.
Generated evidence lives in the gitignored
`skills/gtm-lead-scoring-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-root-exact-score | 10/10 | 6/10 |
| bulk-mixed-lead-ranking | 11/11 | 5/11 |
| child-nearest-lead-rubric | 11/11 | 6/11 |
| **Mean pass rate** | **100.0%** | **53.3%** (delta **+0.47**) |

- Every assertion passed in the accepted with-skill runs; all three blind
  pairwise comparisons preferred the skill-assisted output.
- Early iterations exposed active-person confusion, missing repository-relative
  org paths, combined raw/final fields, and a stochastic bulk-average error.
  The final skill resolves each with state-authoritative identity/path rules,
  literal output contracts, and tool-assisted bulk arithmetic verification.
- Safety audits verify unchanged state/context/Git, no `~/.gtm` access, and no
  persisted scoring artifact in accepted runs.
- The official skill-creator viewer was generated, served privately through
  Tailscale, and verified byte-identical locally and through private HTTPS. The
  client waived per-skill gates; clean self-review is accepted as empty feedback.
