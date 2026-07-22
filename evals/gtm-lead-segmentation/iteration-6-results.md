# gtm-lead-segmentation — iteration 6 results (done-gate evidence)

Date: 2026-07-22. Executor: gpt-5.6-luna. Grader: gpt-5.6-terra.
Generated evidence lives in the gitignored
`skills/gtm-lead-segmentation-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-responsibility-match | 9/9 | 5/9 |
| bulk-mixed-persona-routing | 10/10 | 7/10 |
| child-persona-override | 10/10 | 5/10 |
| **Mean pass rate** | **100.0%** | **58.5%** (delta **+0.41**) |

- Every assertion passed in all accepted with-skill runs; all baselines were
  contamination-free.
- Bare-core comparison exposed operator/lead confusion and path formatting.
  Later iterations stabilized interaction handling, verbatim transcript
  evidence, one-off/bulk field templates, metadata, and canonical-root syntax.
- Safety audits verify unchanged state/context/Git, no `~/.gtm` access, and no
  persisted segmentation artifact in accepted runs.
- The skill-creator viewer was generated and self-reviewed, then verified as the
  same artifact locally and through the private Tailscale HTTPS route. The client
  waived per-skill gates; clean self-review is accepted as empty feedback.
