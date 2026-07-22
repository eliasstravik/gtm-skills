# gtm-account-research — iteration 3 results (done-gate evidence)

Date: 2026-07-22. Executor: gpt-5.6-luna. Grader: gpt-5.6-terra.
Generated evidence lives in the gitignored
`skills/gtm-account-research-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-conflicted-evidence | 10/10 | 6/10 |
| bulk-mixed-source-depth | 11/11 | 4/11 |
| child-approved-promotion | 13/13 | 5/13 |
| **Mean pass rate** | **100.0%** | **44.9%** (delta **+0.55**) |

- Every assertion passed in all accepted with-skill runs; all baselines were
  contamination-free.
- The bare core improved the one-off brief but still confused canonical and
  physical child paths and over-triggered review. Iteration 1 corrected those
  failures; iteration 2 completed promotion metadata but exposed missing compact
  bulk fields; iteration 3 resolves all failures.
- Safety audits verify unchanged state, no `~/.gtm` access, no tokenized-source
  exposure, clean response-only repositories, and a promotion task commit that
  contains only `suborgs/emea/research/baltic-ledger.md`.
- The skill-creator viewer was generated and self-reviewed, then verified as the
  same artifact locally and through the private Tailscale HTTPS route. The client
  waived per-skill gates; clean self-review is accepted as empty feedback.
