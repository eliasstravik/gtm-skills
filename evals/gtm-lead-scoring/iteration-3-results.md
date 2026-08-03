# gtm-lead-scoring — iteration 3 accepted results

Date: 2026-08-02. This is the done-gate benchmark.

| Eval | with skill | without skill |
| --- | ---: | ---: |
| one-off-strong-fit | 14/14 | 5/14 |
| bulk-all-bands | 16/16 | 4/16 |
| child-persona-precedence | 15/15 | 5/15 |
| **Overall** | **45/45 (100.0%)** | **14/45 (31.1%)** |

The model-free aggregator reports a 100.0% treatment mean and 31.4% baseline mean because it averages the three per-eval rates; the pooled baseline fraction above is 31.1%.

## Models used, exactly

- Skill authoring, assertion jurisdiction, harness review, and final autonomous self-review: `gpt-5.6-sol`, high reasoning.
- All treatment and baseline executor arms across three iterations: `gpt-5.6-terra`, medium reasoning.
- All independent graders across three iterations: `gpt-5.6-sol`, high reasoning.
- Benchmark analysts and blind comparators: `gpt-5.6-terra`, high reasoning.
- Trigger optimization after benchmark acceptance: `gpt-5.6-terra`, low reasoning.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used for Task 8.

## Iteration history

- Iteration 1: treatment passed 38/45 assertions (84.4% pooled; 84.5% aggregator mean) versus baseline 15/45 (33.3% pooled; 33.7% mean). The bare core established label preservation, qualitative Bands, precedence, missing-fact review, and read-only safety. It missed exact persona sentences, Owen's buying-role gap and verbatim disqualifier/cap, exact Git-history wording, and isolation of a child persona's maintenance question. These failures earned five Details lines.
- Iteration 2: treatment passed 43/45 (95.6% pooled; 95.8% mean) versus baseline 16/45 (35.6% pooled; 35.8% mean). Exact persona, disqualifier, and side-effects wording held. The remaining bulk defect phrased a fixed gap field as an interrogative question. A separate self-review rejected the grader's lenient child-position pass because physical `suborgs/emea` had leaked into the canonical `emea` path. Those two demonstrated defects earned the final two Details lines.
- Iteration 3: every treatment assertion passed. All three copied repositories retained byte-identical manifests, their single `fixture baseline` commit, clean index/worktree status, and no external or machine-state side effects. Every task Git inspection used `git -C <repo-root>`.

Accepted treatment executor wall-clock times were 42s, 52s, and 70s (mean 54.7s); baselines were 23s, 38s, and 63s (mean 41.3s). This harness exposes no completion-notification token or duration telemetry, so each `timing.json` honestly records measured wall clock and zero unavailable tokens. Per-run grader, comparator, and analyst token/duration telemetry is unavailable.

The static viewer was generated before self-review in every iteration. Blind comparison used neutral A/B directories with varied assignment and selected treatment in all three accepted evals. Final self-review read all six accepted transcripts and found no actionable treatment defect. The copied baseline transcripts in `no-skill-failures/` are byte-identical to the accepted without-skill transcripts.

## Harness caveats

- `aggregate_benchmark` describes the three evals as three runs per configuration; there is one `run-1` for each eval/arm, exactly as required by the task loop, so its standard deviation is cross-eval variation rather than repeatability.
- The aggregator leaves executor/analyzer model fields as placeholders. Exact model identity is therefore recorded above from the commands and prompts used for every role.
- The mechanical checker initially overmatched required metadata containing the word `approval`; its question detection was corrected before accepted grading. In iteration 2, the checker correctly rejected the physical child path even though the independent grader passed it; the harsher self-review governed the next change.
