# gtm-account-segmentation — iteration 5 accepted results

Date: 2026-08-02. This is the done-gate benchmark.

| Eval | with skill | without skill |
| --- | ---: | ---: |
| one-off-root-match | 13/13 | 8/13 |
| bulk-mixed-routing | 15/15 | 8/15 |
| child-nearest-precedence | 13/13 | 6/13 |
| **Overall** | **41/41 (100.0%)** | **22/41 (53.7%)** |

Models used, exactly:

- Skill revision, assertion jurisdiction, and final autonomous self-review: `gpt-5.6-sol`, high reasoning.
- All six executor arms: `gpt-5.6-terra`, medium reasoning.
- All six independent graders: `gpt-5.6-sol`, high reasoning.
- Benchmark analyst and all three blind comparators: `gpt-5.6-terra`, high reasoning.
- Trigger optimization, run separately after acceptance: `gpt-5.6-terra`, low reasoning.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used for Task 4.

Every critical and noncritical with-skill assertion passes. All six copied repos retained byte-identical manifests, their single fixture-baseline commit, clean index/worktree status, and no external or machine-state side effects. All task Git inspection used `git -C <repo-root>`. No run accessed `~/.gtm`, a real context repo, home config, or machine state.

Accepted treatment executor wall-clock times were 55s, 58s, and 51s (mean 54.7s); baselines were 30s, 67s, and 46s (mean 47.7s). Token counts and per-run grader/comparator durations are honestly unavailable from completion notifications; tokens are recorded as zero and timing evidence is limited to measured executor wall clock.

The static review was generated before final self-review. After unblinding, the skill won all three comparisons. The eval-2 comparator incorrectly called lowercase `orbitpay` a defect because it preferred the display title; that critique was rejected under PLAN's cwd-derived repo-basename contract and assertion A. Final self-review read every accepted transcript and found no remaining actionable behavior defect.

## Iteration history

- Iteration 1, bare core: 32/41 with skill versus 22/41 without. It established read-only safety, singular labels, fixed fields, and metadata while exposing confidence, alternative-reasoning, display-title, boolean, overridden-source, and position-order gaps.
- Iteration 2, first evidence-earned Details treatment: 36/41 versus 22/41. Bulk passed completely; child evaluation then distinguished physical from canonical paths and proved overridden root same-stem content must stay out of evidence.
- Iteration 3: 37/41 versus 22/41. Canonical-path and override handling were fixed; assertion review corrected an underinclusive position check and rejected a first-visible-message rule that exceeded PLAN's settled contract.
- Iteration 4: 40/41 versus 22/41. The remaining failure was exact physical repo-basename fidelity, earning the final Details line.
- Iteration 5, accepted: 41/41 versus 22/41. Every assertion passed and autonomous feedback was empty.

This single accepted-results file consolidates the earlier iteration summaries so the committed evidence follows PLAN G6's one-`iteration-N-results.md` shape without losing the changes, reasons, or benchmark history.
