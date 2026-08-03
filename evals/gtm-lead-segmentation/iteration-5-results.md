# gtm-lead-segmentation — iteration 5 results (done-gate evidence)

Date: 2026-08-02. Accepted executor iteration: 5. Generated run evidence remains in the gitignored `skills/gtm-lead-segmentation-workspace/`.

## Final benchmark

| Eval | with_skill | without_skill |
| --- | --- | --- |
| one-off-responsibility-beats-title | 13/13 | 5/13 |
| bulk-mixed-persona-routing | 15/15 | 8/15 |
| child-persona-override | 14/14 | 4/14 |
| **Mean pass rate** | **100.0%** | **40.1%** (delta **+0.60**) |

Every accepted treatment assertion, including every critical assertion, passed. All six accepted runs exited successfully. Mechanical evidence confirms unchanged fixture manifests, HEADs, clean worktrees, exactly one fixture commit, byte-identical root templates, no machine state, and no forbidden home access. The baseline outputs often chose the right label but missed the ordered source report, exact working line, fixed output schemas, alternative reasoning, metadata, or interaction discipline; their full accepted transcripts are preserved verbatim in `no-skill-failures/`.

Blind comparisons were completed before unblinding. Treatment won all three final pairs. The neutral comparator scored treatment 10.0/10.0/10.0 versus baseline 3.7/4.7/3.4. The static review viewer was generated before final acceptance, the analyzer report was read, and every accepted transcript was then self-reviewed with no remaining material feedback.

## Model record

- Builder and autonomous self-review: `gpt-5.6-sol`, high reasoning.
- Treatment and baseline executors: `gpt-5.6-terra`, medium reasoning.
- Independent graders: `gpt-5.6-sol`, high reasoning.
- Blind comparators: `gpt-5.6-terra`, high reasoning.
- Benchmark analyzer: `gpt-5.6-terra`, high reasoning.
- Description-routing ratchet: `gpt-5.6-terra`, low reasoning.
- Benchmark aggregation, mechanical checks, SHA-256/Git checks, static viewer generation, validation, and installer verification: model-free local scripts and commands.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script ran. The sanctioned Python tooling was read and run only where model-free.

The Codex CLI harness did not expose subagent completion notifications with token/duration telemetry. Each run therefore records `total_tokens: 0` and honest wall-clock duration in `timing.json`, with the measurement limitation stated there. Final treatment durations were 54s, 71s, and 58s; baseline durations were 53s, 67s, and 44s.

## Iteration history

| Iteration | Treatment | Baseline | Change and reason |
| --- | --- | --- | --- |
| 1 | 40/41 (97.4%) | 18/41 (43.4%) | Bare core. Child output used physical `suborgs/emea`, duplicated and punctuated the working line, and misrendered canonical metadata; blind comparison preceded the first Details line. |
| 2 | 41/42 (97.4%) | 20/42 (47.4%) | Added physical-to-canonical mapping, exact one-time working line, verbatim repo basename, and literal confidence/review rendering. Alex's supplied executive-sponsor unknown disappeared from `Open questions`; source/interaction narration and child alternative reasoning were also hardened after assertion review. |
| 3 | 41/42 (97.4%) | 18/42 (42.5%) | Preserved supplied unknowns, consolidated source reporting, removed interaction narration, and named losing personas. Root metadata rendered `(root)` instead of exact `root`. |
| 4 | 39/42 (92.5%) | 18/42 (42.5%) | Fixed the root sentinel. Stochastic treatment exposed a provisional source line, an unsupported persona-criterion overclaim as a lead fact, and an omitted internal-employment citation. Mechanical source checks were strengthened accordingly. |
| 5 | 42/42 (100.0%) | 17/42 (40.1%) | Required literal source paths after completed inspection, kept alternative criteria separate from lead facts, and required every supplied employment/scope/responsibility fact in evidence. Grader critiques then strengthened exact identity/value and bulk-summary assertions; the unchanged treatment still passed 42/42. |

The aggregate script's generated prose says “3 runs each per configuration,” but the required protocol here is three evals with one fresh treatment and one fresh baseline run each, totaling six runs per iteration. The workspace correctly contains only `run-1` for each eval/arm. Reported standard deviations are across the three distinct evals, not repeat executions of one eval.
