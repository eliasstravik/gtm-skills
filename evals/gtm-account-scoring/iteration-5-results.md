# gtm-account-scoring — iteration 5 accepted results

Date: 2026-08-02. This is the done-gate benchmark.

| Eval | with skill | without skill |
| --- | ---: | ---: |
| one-off-strong-fit | 14/14 | 5/14 |
| bulk-all-bands | 16/16 | 5/16 |
| child-icp-precedence | 15/15 | 5/15 |
| **Overall** | **45/45 (100.0%)** | **15/45 (33.3%)** |

The model-free aggregator reports a 100.0% treatment mean and 33.4% baseline mean because it averages the three per-eval rates; the pooled baseline fraction shown above is 33.3%.

## Models used, exactly

- Skill authoring, assertion jurisdiction, harness review, and final autonomous self-review: `gpt-5.6-sol`, high reasoning.
- All treatment and baseline executor arms across five iterations: `gpt-5.6-terra`, medium reasoning.
- All independent graders across five iterations: `gpt-5.6-sol`, high reasoning.
- Benchmark analysts and the three accepted blind comparators: `gpt-5.6-terra`, high reasoning.
- Trigger optimization, run after benchmark acceptance: `gpt-5.6-terra`, low reasoning.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used for Task 5.

## Iteration history

- Iteration 1: treatment mean 82.4% versus baseline 34.2%. The bare core established qualitative Bands, label preservation, precedence, and read-only safety but missed literal booleans/no-effects wording, one operator, bulk confidence calibration, and explicit cap language.
- Iteration 2: treatment mean 91.2% versus baseline 33.4%. Earned Details fixed confidence/review and side-effect behavior; Kestrel was then over-downgraded to `weak-fit`, and exact working-line rendering remained unstable.
- Iteration 3: treatment mean 97.9% versus baseline 35.6%. Band calibration became correct; remaining defects were repo-display-name versus directory-basename and person-id versus person-H1 ambiguity.
- Iteration 4: treatment mean 95.5% versus baseline 31.4%. Position sources were correct, but root echoes retained a slash and two Fit Signal names were lowercased. Both failures earned the final precision lines.
- Iteration 5: every treatment assertion passed. All three copied repos retained byte-identical manifests, their single fixture-baseline commit, clean index/worktree status, and no external or machine-state side effects. Every task Git inspection used `git -C <repo-root>`.

Accepted treatment executor wall-clock times were 40s, 57s, and 53s (mean 50.0s); baselines were 39s, 41s, and 53s (mean 44.3s). The current harness exposes no completion-notification token or duration data, so `timing.json` honestly records measured executor wall clock and zero unavailable tokens. Per-run grader/comparator token and duration telemetry is unavailable.

The static viewer was generated before final self-review. The first blind-comparator attempt omitted the applicable assertions and misread the required bulk distribution as forbidden arithmetic; its outputs were discarded before unblinding was used for any skill change. The corrected neutral prompts included the applicable assertions, varied A/B assignment, stayed blind to arm identity, and selected treatment in all three evals. Final self-review read every accepted transcript and found no remaining actionable treatment defect.
