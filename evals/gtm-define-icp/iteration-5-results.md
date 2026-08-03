# gtm-define-icp — iteration 5 results

Date: 2026-08-02. Iteration 5 is the accepted full-treatment run.

## Benchmark

| Eval | With skill | Without skill | Delta |
| --- | ---: | ---: | ---: |
| 1 — create first ICP | 17/17 (100%) | 7/17 (41.2%) | +58.8 pp |
| 2 — refine existing ICP | 18/18 (100%) | 13/18 (72.2%) | +27.8 pp |
| 3 — altitude mismatch | 18/18 (100%) | 9/18 (50.0%) | +50.0 pp |
| Aggregate tool mean | 100.0% | 54.5% | +45.5 pp |

Every critical and noncritical assertion passed in all three with-skill runs.
The final baselines preserved meaningful failures in position/source reporting,
the single-message approval gate, lifecycle/schema handling, altitude sequence,
commit discipline, and closing summaries.

Raw executor wall-clock seconds were 138/105/118 with skill and 92/73/83
without skill for evals 1–3. `timing.json` records `total_tokens: 0` because the
harness completion notifications exposed neither token nor duration data; the
duration is parent-measured wall clock. The benchmark viewer's token field is
derived from output characters, not measured model tokens, and some aggregate
duration fields were contaminated by grader timing. Neither aggregate timing
nor token figures are treated as performance evidence.

## Exact model ledger

- Skill authoring, assertion decisions, self-review, preflight, and final gates:
  `gpt-5.6-sol` (high).
- With-skill and without-skill executor arms, iterations 1–5:
  `gpt-5.6-terra` (medium).
- Formal graders: `gpt-5.6-sol` (high) for the initial iteration-1 grades and
  iterations 2–5; the strengthened-assertion regrade of unchanged iteration-1
  evidence used `gpt-5.6-sol` (medium).
- Blind forced comparators: `gpt-5.6-terra` (high).
- Benchmark analysts: `gpt-5.6-terra` (high).
- Blind-verdict post-hoc review: `gpt-5.6-sol` (high).
- Description trigger probes: `gpt-5.6-terra` (low).
- P6 mechanics probes: inherited `gpt-5.6-sol` (high); completion notices did
  not expose token/duration fields.

No Claude-family model or Claude CLI command was invoked. The model-free Python
validator, aggregator, and static viewer were run from their sanctioned
`~/.claude/skills/skill-creator/` filesystem paths; the path name is not model
usage. `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run.

## Iteration history

| Iteration | With skill | Without skill | Change and reason |
| --- | ---: | ---: | --- |
| 1 | 86.9% | 58.3% | Bare 15-step Recipe. Blind comparison ran before Details; with-skill won evals 1–2, baseline won eval 3. |
| 2 | 88.9% | 52.6% | Added earned source-list, corrected-position, and closing-summary lines. Eval 3 exposed physical-vs-canonical path confusion and role inflation. |
| 3 | 96.2% | 62.1% | Added canonical-path and evidence-fidelity lines. Eval 1 still related independent facts; eval 2 summary omitted exact labeled fields. |
| 4 | 98.2% | 54.5% | Tightened those two existing lines. All critical assertions passed; eval 3 still omitted the named package from the durable file. |
| 5 | 100.0% | 54.5% | Added the earned durable offer/package association line; all 53 assertions passed. |

The mandatory blind comparison used neutral A/B assignments: eval 1
A=with-skill, eval 2 B=with-skill, eval 3 A=with-skill. The comparator selected
the with-skill output for evals 1 and 2. It selected the baseline for eval 3,
but its rationale incorrectly rewarded `working definition` for a new ICP and
invented source details; the preserved formal assertions and post-hoc review
identified that comparator error. The comparison still fulfilled the
pre-Details blind gate and was not used to weaken the contract.

Iteration 2 contains one preserved `invalid-harness-run-1` for eval 3 with
skill: fixture prep invoked git without `git -C`. It was excluded from grading
and aggregation, then replaced by a deterministically prepared accepted run on
the same model. Iterations 3–5 used parent-prepared fixtures throughout.

## Final review

The model-free static viewer was generated for every iteration before the
author's transcript review. The final analyst found 53/53 with-skill assertions
and 29/53 baseline assertions, with A/B/D/G discriminating in every eval.
Self-review then read all six final transcripts and found no remaining skill
defect. The one-shot scripted-reply harness cannot prove transcript chronology
from a mutable transcript alone; executor events, command order, preview-to-disk
bytes, and write timing were used as corroborating evidence. This limitation is
recorded rather than promoted into shipping instructions.

`npx skills add` copied the skill to `~/.agents/skills/gtm-define-icp`, and the
installed directory is byte-identical to the shipping directory. The installer
also reported that its optional PromptScript target does not support global
installation; this did not affect the Codex/agent installation or byte check.
