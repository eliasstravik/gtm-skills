# GTM workflow rename evidence

Date: 2026-08-26

## Scope

- Workflow definitions now live below the root Nitro project at `workflows/workflows/<slug>.ts` or `workflows/workflows/<suborg-path>/<slug>.ts`.
- Nitro discovers the inner `workflows/` directory, runtime identifiers use `workflow//./workflows/<path>//<exportName>`, and public run routes remain unchanged.
- Completed output is always retained by the workflow runtime. External delivery is an optional additional destination and only adds delivery code when selected.
- Workspace templates, documentation, graders, fixtures, and local UI checks use the same contract.

## Paired behavioral benchmark

All 20 executors used `gpt-5.6-sol`: ten final-candidate runs and ten runs against the untouched pre-change snapshot at commit `bef823e`. Every executor returned zero. Graders inspected disposable repository state and scripted conversation artifacts.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean normalized tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 43/43 | 100.0% | 121.9 s | 19,179 |
| Pre-change snapshot | 34/43 | 83.3% | 133.9 s | 19,344 |

The nine-assertion lift is confined to the three creation scenarios that test the renamed definition directory and new completed-results choice. Scenarios 4 through 10 stayed green in both configurations. One run per scenario makes the timing and token figures descriptive only.

The generated static review is `evals/gtm-workflow/evidence/final/review.html`. It contains candidate and snapshot outputs, formal grades, benchmark metrics, and analyst notes. Snapshot output intentionally records the superseded contract for comparison. Local absolute paths and fixture secret values were removed from the stored artifact.

## Regression suites

- `gtm-workflow`: 43/43 final-candidate assertions across ten scenarios.
- `gtm-workspace`: 80/80 assertions across all 13 scenarios.
- `gtm-icp`: 50/50 assertions across all seven scenarios.
- `gtm-persona`: 50/50 assertions across all seven scenarios.
- Local UI contract: passed.
- Workspace template contract: 5/5 passed.
- ICP and persona retained-line compliance: 31/31 each.

`regression-summary.json` records the per-scenario totals.

## Trigger routing

The active descriptions for `gtm-workflow`, `gtm-workspace`, and `gtm-icp` were each classified three times across 20 queries. Each skill scored 60/60 overall, 36/36 on the train split, and 24/24 held out with full positive recall and negative specificity. The three descriptions were retained unchanged.

## Disposable runtime proof

A real scaffold copied from the maintained templates was installed and built outside the repository. `npm run build` found one workflow with 16 steps. `workflow validate` scanned five files and reported no serialization issues. An authenticated local run completed with `alpha` and `beta`, the native Workflows UI returned HTTP 200, and the native manifest RPC returned:

- definition path: `workflows/example.ts`
- workflow ID: `workflow//./workflows/example//example`

No provider, deployment, or agent call ran. The package install reported 13 high-severity findings in pinned dependencies and an `allowScripts` warning; dependency remediation is outside this rename.

## Failures and reruns

- Workflow iteration 1 exposed one real nested naming defect plus evaluator defects. Iteration 2 exposed an underspecified missing-workspace handoff and a strict deletion grader. The complete third iteration passed 43/43.
- Initial workspace runs exposed stale lowercase `org.md` fixtures and a root runtime fixture that did not match ignored-file behavior. After fixture corrections and case-sensitive rename verification, the complete suite passed 80/80.
- Two complete ICP runs repeated a genuine guided-question ordering conflict. The reference was corrected and the complete third run passed 50/50.
- The first persona run exposed a grader stem that rejected “durably” while requiring durable-save evidence. The corrected full rerun passed 50/50.
- The first local runtime poll used zsh's read-only `status` name. Renaming that local variable allowed the same disposable run to complete.

## Verification commands

`$SCRATCH` below is the disposable evaluation root and `$BASELINE_SKILL_ROOT` is its untouched `bef823e` skill snapshot.

- `python3 <skill-creator>/scripts/quick_validate.py skills/gtm-workflow`
- `python3 <skill-creator>/scripts/quick_validate.py skills/gtm-icp`
- `python3 scripts/check_repo_layout.py`
- `python3 evals/gtm-workflow/scripts/run_evals.py "$SCRATCH/iteration-3" --configurations with_skill,baseline_skill --baseline-skill-root "$BASELINE_SKILL_ROOT" --max-workers 4`
- `python3 evals/gtm-workflow/scripts/grade_evals.py "$SCRATCH/iteration-3"`
- `python3 evals/gtm-workspace/scripts/run_evals.py "$SCRATCH/workspace-regression-4" --configurations with_skill --max-workers 4`
- `python3 evals/gtm-workspace/scripts/grade_evals.py "$SCRATCH/workspace-regression-4"`
- `python3 evals/gtm-icp/scripts/run_evals.py "$SCRATCH/icp-regression-3" --configurations with_skill --max-workers 4`
- `python3 evals/gtm-icp/scripts/grade_evals.py "$SCRATCH/icp-regression-3"`
- `python3 evals/gtm-persona/scripts/run_evals.py "$SCRATCH/persona-regression-2" --configurations with_skill --max-workers 4`
- `python3 evals/gtm-persona/scripts/grade_evals.py "$SCRATCH/persona-regression-2"`
- `python3 evals/gtm-icp/description/run_classifier.py --evals evals/gtm-workflow/description/trigger-eval.json --candidates evals/gtm-workflow/description/candidates.json --candidate-index 0 --runs 3 --workers 6 --output "$SCRATCH/triggers/gtm-workflow"`
- `python3 evals/gtm-icp/description/run_classifier.py --evals evals/gtm-workspace/description/trigger-eval.json --candidates evals/gtm-workspace/description/candidates.json --candidate-index 0 --runs 3 --workers 6 --output "$SCRATCH/triggers/gtm-workspace"`
- `python3 evals/gtm-icp/description/run_classifier.py --candidate-index 0 --runs 3 --workers 6 --output "$SCRATCH/triggers/gtm-icp"`
- `python3 <skill-creator>/scripts/aggregate_benchmark.py "$SCRATCH/iteration-3" --skill-name gtm-workflow --skill-path skills/gtm-workflow`
- `python3 <skill-creator>/eval-viewer/generate_review.py "$SCRATCH/iteration-3" --skill-name gtm-workflow --benchmark "$SCRATCH/iteration-3/benchmark.json" --static "$SCRATCH/iteration-3/review.html"`
- `python3 evals/gtm-workflow/scripts/test_local_ui_contract.py`
- `python3 evals/gtm-workspace/scripts/test_contract.py`
- `python3 evals/gtm-icp/scripts/check_compliance.py`
- `python3 evals/gtm-persona/scripts/check_compliance.py`
- In the disposable runtime scaffold: `npm ci`, `npm run build`, `./node_modules/.bin/workflow validate`, `PORT=43136 npm run dev`, authenticated POST and GET requests to the unchanged run/result routes, `./node_modules/.bin/workflow inspect runs`, GET `/_workflow`, and the native `fetchWorkflowsManifest` RPC.
