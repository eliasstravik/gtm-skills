# GTM workflow skill evidence

Date: 2026-08-14

## Scope

- `gtm-workflow` is one Lifecycle SOP with exactly setup, create, update, inspect, delete, and run.
- It owns node-local `workflows/WORKFLOWS.md`, `workflows/<slug>/WORKFLOW.md`, tracked local implementations, and the accepted target-side lifecycle.
- It ships three prose target starting shapes—Clay, Vercel Workflows, and Local TypeScript + SQLite—with no adapters, SDKs, or generated framework scaffold.
- `gtm-workspace` only recognizes node placement and tolerated untracked working state; `gtm-workflow` owns content and ignore repair.

## Paired behavioral benchmark

Executor and grader: `gpt-5.6-sol`; one with-skill and one without-skill run for each of eleven scenarios. Timing and token counts come from Codex `turn.completed` usage.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean total tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 44/44 | 100.0% | 106.639 s | 266,942 |
| Without skill | 24/44 | 54.5% | 90.186 s | 198,198 |

- Candidate total: 2,936,359 tokens and 1,173.026 seconds; range 50.880–228.752 seconds.
- Without-skill total: 2,180,182 tokens and 992.040 seconds; range 55.648–165.797 seconds.
- The candidate improved mean pass rate by 45.5 percentage points at a mean cost of 16.5 seconds and 68,743 tokens per scenario.
- Setup-second-target, ungated local run, and mutation-free single inspect passed in both configurations; they remain regression guards rather than discriminators.

## Iteration

The first iteration scored 43/44 with the skill versus 24/44 without it. Its sole candidate defect was offering Local as the recommended target before refusing it for a triggered workflow. The final flow determines kind first and excludes Local from scheduled or triggered choices; iteration 2 scored 44/44.

After the paired benchmark, the local-target guidance was clarified without changing the contract: scheduled cadence may come from an infrastructure/app target or an external agent-harness scheduler invoking an on-demand workflow; recurring sweeps may select due rows from SQLite; repeated provider calls graduate into tracked typed wrappers; and the script, not agent context, owns row iteration. Static QC pins each clarification.

## Trigger optimization

- The maintained set has ten realistic positives and ten sibling/near-miss negatives, split deterministically into 12 train and 8 held-out queries.
- The incumbent scored 19/20 because persona-based lead scoring false-triggered; a second candidate scored 19/20 because workflow-owned health inspection false-negative routed to workspace repair.
- Candidates 2 and 3 scored 20/20 overall and 8/8 held-out with perfect recall and specificity.
- Candidate 3 won the shorter-routing and lower-classifier-token tie-break. Its exact `best_description` is applied verbatim in `SKILL.md`; full scores are in `trigger-optimization.json`.

## Verification commands

- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/quick_validate.py skills/gtm-workflow`
- `python3 evals/gtm-workflow/scripts/check_compliance.py`
- `python3 evals/gtm-workspace/scripts/test_contract.py`
- `python3 evals/gtm-workflow/scripts/run_evals.py evals/gtm-workflow/evidence/iteration-2 --configurations with_skill,without_skill --max-workers 6`
- `python3 evals/gtm-workflow/scripts/grade_evals.py evals/gtm-workflow/evidence/iteration-2`
- `python3 -m scripts.aggregate_benchmark evals/gtm-workflow/evidence/iteration-2 --skill-name gtm-workflow` from the skill-creator directory
- Four calls to `python3 evals/gtm-workflow/description/run_classifier.py`, candidate indices 0–3, model `gpt-5.6-sol`, one run per query

The static review artifact contains Outputs and Benchmark views for the final candidate, without-skill baseline, and previous iteration.
