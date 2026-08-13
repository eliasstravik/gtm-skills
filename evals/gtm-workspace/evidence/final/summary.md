# GTM workspace canonical migration evidence

Date: 2026-08-13

## Scope and compatibility

- `skills/gtm-workspace/` is the sole base lifecycle skill and `evals/gtm-workspace/` is its maintained evaluation root.
- The persisted contract remains `~/.gtm/<org-slug>/` with nested organization nodes, root-owned people, and node-owned `icps/` and `personas/`; existing workspaces require no migration.
- README, getting-started material, diagrams, ICP/persona contracts, and ICP/persona template-loading harnesses resolve the new canonical identity.
- ICP and persona behavior was not redesigned; only canonical terminology and dependency paths changed.

## SOP evidence

- The admitted survivor categories are the private workspace schema, chosen storage and history conventions, authority boundaries, hosting-surface controls, and deterministic evaluation tools.
- The skill is one Lifecycle SOP with the bare entity name `gtm-workspace`.
- `SKILL.md` contains Trigger, Scope, Inputs, Roles, Procedure, Outputs, Exceptions, QC, and References in that order.
- The 206-line guided-flow reference includes a table of contents; the 77-line contract reference remains directly disclosed.
- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/quick_validate.py skills/gtm-workspace` passed.

## Behavioral benchmark

The approved first review exposed two question-order misses in bundled onboarding. The revision restored the original question-first control, added exact full-path deletion consequences, and corrected deterministic graders to recognize question-first proposals without weakening substantive checks.

Final paired iteration:

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 80/80 | 100.0% | 93.6 s | 216,110 |
| Untouched pre-migration baseline | 70/80 | 88.5% | 95.6 s | 215,077 |

- All 13 candidate scenarios passed every assertion.
- The candidate matched the baseline on established update, deletion, content-placement doctor safety, and hosted-surface controls while improving creation, import, broken-repo repair, bundled recovery, and fallback behavior.
- `python3 evals/gtm-workspace/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/iteration-3" --configurations with_skill,baseline_skill --max-workers 8 --baseline-skill-root "$BASELINE_SKILL_ROOT"` completed all 26 executors successfully.
- `python3 evals/gtm-workspace/scripts/grade_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/iteration-3"` produced the 80/80 and 70/80 totals.
- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/aggregate_benchmark.py "$PAPERCLIP_RUN_SCRATCH_DIR/iteration-3" --skill-name gtm-workspace` generated the benchmark; `finalize_benchmark.py` attached the analyst notes.

## Trigger optimization

- The maintained set has 20 realistic queries: ten lifecycle positives and ten close negatives.
- The incumbent description scored 58/60 overall, 30/30 positive recall, and 24/24 held-out accuracy.
- Two optimizer proposals each scored 54/60 overall and 24/24 held-out, broadening into adjacent persona, segmentation, or scoring work.
- With held-out accuracy tied, the incumbent won the non-regression tie-break on overall accuracy and negative specificity. Its exact text remains the optimizer's selected `best_description` and is applied verbatim in frontmatter.
- Full measurements and the selection reason are in `trigger-optimization.json`.

## Downstream regression evidence

- ICP: all five with-skill scenarios passed, 41/41 assertions.
- Persona: the five-scenario run passed 40/41; every artifact, scope, history, and isolation assertion passed. One run placed an informational status line above the bold acceptance question. The isolated unchanged root-update rerun passed 7/7, confirming stochastic presentation variance rather than a canonical-path regression. No persona SOP changes were made.

Commands:

- `python3 evals/gtm-icp/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/gtm-icp-regression" --skill-file skills/gtm-icp/SKILL.md --configurations with_skill --max-workers 5`
- `python3 evals/gtm-icp/scripts/grade_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/gtm-icp-regression"`
- `python3 evals/gtm-persona/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/gtm-persona-regression" --skill-file skills/gtm-persona/SKILL.md --configurations with_skill --max-workers 5`
- `python3 evals/gtm-persona/scripts/grade_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/gtm-persona-regression"`
- `python3 evals/gtm-persona/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/gtm-persona-regression-rerun" --skill-file skills/gtm-persona/SKILL.md --ids 3 --configurations with_skill --max-workers 1`

## Repository validation

- `python3 scripts/check_repo_layout.py` passed with three installable skills.
- Python compilation passed for the migrated workspace scripts and affected ICP/persona harnesses.
- `git diff --check` passed.
- The obsolete canonical-name scan returned no repository-content matches when Git's worktree pointer was excluded.
- The obsolete skill and eval roots are absent.

The generated static final review contains both Outputs and Benchmark tabs and compares this final iteration with the previous reviewed iteration.
