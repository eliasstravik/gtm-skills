# gtm-define-icp — iteration 1 results (done-gate evidence)

Date: 2026-07-22. Executor model: gpt-5.6-luna. Grader model:
gpt-5.6-terra. Generated runs, gradings, and benchmark live in the gitignored
`skills/gtm-define-icp-workspace/iteration-1/`.

| Eval | with_skill | without_skill |
| --- | --- | --- |
| create-first-icp | 13/15 | 8/15 |
| refine-existing-icp | 12/15 | 11/15 |
| altitude-mismatch | 11/15 | 6/15 |
| **Pass rate** | **80.1%** | **55.4%** (delta **+0.25**) |

- The skill improved mean assertion pass rate by 24.7 percentage points while
  averaging 12.9 seconds faster and 52,126 fewer tokens per run.
- All three without-skill arms were verified contamination-free. The skill's
  strongest gains were the stable ICP schema, canonical child qualified label,
  lifecycle semantics, exact approval-preview gate, and final reporting.
- Client reviewed the eval viewer (outputs + benchmark) and submitted no
  feedback, meeting skill-creator's done condition on iteration 1.
- Persisted transcripts under-recorded some live user-facing messages. This
  made A1 and A4 conservative: the skill required and the live runs emitted the
  working-position line and full preview, but several transcripts omitted them.
- The altitude with-skill A3/T2 failures are grader overreach from fixture
  preparation: `.gitignore` was pristine and byte-identical, but the executor
  omitted it from the fixture baseline commit. The task commit contains only
  the approved child ICP.
- Grader-driven eval refinements now require verbatim capture of every
  user-facing message, explicit dotfile inclusion in fixture baselines,
  before/after state checksums, and exact qualified labels in final responses.
  These improve future rerun evidence; they do not change the graded outcome.
