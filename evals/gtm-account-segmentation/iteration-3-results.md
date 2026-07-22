# gtm-account-segmentation — iteration 3 results (done-gate evidence)

Date: 2026-07-22. Executor model: gpt-5.6-luna. Grader model:
gpt-5.6-terra. Generated runs, gradings, benchmark, and viewer inputs live in
the gitignored `skills/gtm-account-segmentation-workspace/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-root-match | 9/9 | 5/9 |
| bulk-mixed-routing | 10/10 | 6/10 |
| child-nearest-precedence | 11/11 | 4/11 |
| **Mean pass rate** | **100.0%** | **50.6%** (delta **+0.49**) |

- Every critical and noncritical assertion passed in all three accepted
  with-skill runs; all no-skill arms were contamination-free.
- Iteration 1 exposed a missing explicit child `org.md` chain report.
  Iteration 2 fixed that but surfaced classification leaking into a progress
  message before the working-position line. Iteration 3 resolves both.
- Safety audits verify unchanged `state.json`, no explicit `~/.gtm` command
  access, clean context repositories, and unchanged fixture-only Git history.
- The static skill-creator viewer was generated as a 111,194-byte artifact,
  served privately through Tailscale, and verified locally and through its
  private HTTPS route. The client waived per-skill review gates; the clean
  self-review is accepted as empty feedback.
