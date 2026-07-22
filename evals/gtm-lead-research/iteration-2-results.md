# gtm-lead-research — iteration 2 results (done-gate evidence)

Date: 2026-07-22. Executor: gpt-5.6-luna. Grader: gpt-5.6-terra.
Generated evidence lives in the gitignored
`skills/gtm-lead-research-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-conflicted-person-evidence | 10/10 | 4/10 |
| bulk-mixed-person-source-depth | 11/11 | 6/11 |
| child-approved-person-promotion | 13/13 | 3/13 |
| **Mean pass rate** | **100.0%** | **39.2%** (delta **+0.61**) |

- Every assertion passed in iteration 2; all three blind comparisons preferred
  the skill-assisted output.
- The bare core got promotion mechanics right but missed exact source/working
  output, operator-versus-subject identity, priority/review calibration, and
  final metadata. One assertion-earned Details section resolved every failure.
- Safety audits verify unchanged state, no `~/.gtm` access, no response-only
  research artifact, no private-token exposure, and an exact one-file promotion
  commit with a clean worktree.
- The official skill-creator viewer was generated, served privately through
  Tailscale, and verified byte-identical locally and through private HTTPS. The
  client waived per-skill gates; clean self-review is accepted as empty feedback.
