# gtm-setup — iteration 1 results (done-gate evidence)

Date: 2026-07-21. Model (all arms): claude-fable-5. Generated runs, gradings,
and benchmark live in the gitignored `skills/gtm-setup-workspace/iteration-1/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| create-workspace | 14/14 | 3/14 |
| load-switch | 7/7 | 3/7 |
| import-repair | 9/9 | 4/9 |
| **Pass rate** | **100%** | **36%** (delta **+0.64**) |

- All critical assertions passed in every with_skill run; all three
  without_skill arms verified contamination-free.
- Client reviewed the eval viewer (outputs + benchmark) and submitted no
  feedback → vanilla skill-creator done condition (feedback empty) met on
  iteration 1.
- Cost: with_skill averaged ~+30% tokens/time over baseline.
- Grader-driven assertion refinements applied post-review to `evals.json` and
  `assertions.md` (A5 person rendering, L1 pin-values-only, I7 post-repair pin
  question, C4 persisted-not-committed, sixth scripted reply for eval-1).
  These sharpen future reruns; they do not alter the graded outcome above.
