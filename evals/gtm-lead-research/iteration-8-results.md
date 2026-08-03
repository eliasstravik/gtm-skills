# gtm-lead-research — iteration 8 results

Date: 2026-08-02. Iteration 8 is the accepted behavior run.

## Benchmark

| Eval | With skill | Without skill | Delta |
| --- | ---: | ---: | ---: |
| One-off title conflict | 12/12 (100.0%) | 2/12 (16.7%) | +83.3 pp |
| Bulk private-person source | 15/15 (100.0%) | 5/15 (33.3%) | +66.7 pp |
| Child-org promotion | 14/14 (100.0%) | 2/14 (14.3%) | +85.7 pp |
| **Overall** | **41/41 (100.0%)** | **9/41 (21.4%)** | **+78.6 pp** |

Every critical with-skill assertion passes. Mechanical checks pass all three treatment runs. The analyst found no treatment anomaly, the static review was generated before transcript self-review, all six transcripts were read, and self-review found no remaining defect. Blind comparison selected the treatment output in all three evals with the assignment reversed for eval 2.

## Exact models and roles

- Builder, assertion author, harness author, evidence reviewer, and final decision: `gpt-5.6-sol`, high reasoning.
- With-skill executors: `gpt-5.6-terra`, medium reasoning.
- Without-skill executors: `gpt-5.6-terra`, medium reasoning.
- Independent graders: `gpt-5.6-sol`, high reasoning.
- Benchmark analysts: `gpt-5.6-terra`, high reasoning.
- Blind comparators: `gpt-5.6-terra`, high reasoning.
- Trigger-routing probes: `gpt-5.6-terra`, low reasoning.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script ran in this task. Model-free Python scripts under the skill-creator directory supplied validation, aggregation, and static review only.

The collaboration harness did not expose completion-notification token and duration data for the Codex CLI subprocesses. Each `timing.json` therefore records measured wall-clock duration, zero token count as unavailable, executor exit status, and that limitation explicitly.

## Iteration history

- Iteration 1 established the bare-core baseline: treatment 41.1%, baseline 22.8%. It earned Details for literal response fields, calibration, unsafe-source handling, and the promotion contract.
- Iteration 2 reached 88.3% versus 18.9%. It exposed exact repo-case, complete content-read source accounting, and truthful read-only Git metadata.
- Iteration 3 reached 92.8% versus 23.3%. It exposed final metadata placement and the promotion artifact's literal `Lead` key.
- Iteration 4 reached 90.6% versus 26.6%. Promotion became perfect; normal source ledgers still omitted inspected or exact packet labels, and unsafe-source prose remained too descriptive.
- Iteration 5 reached 95.6% versus 21.0%. It revealed a temporary contradiction between the required upfront safe label and an over-restrictive one-occurrence Detail, plus per-lead metadata repetition; both were corrected.
- Iteration 6 reached 92.2% versus 21.6%. It exposed stochastic repo-case drift and omission of `Sources read` from final metadata, prompting a shorter final-block instruction and moving the fixed lead schema into Recipe step 13.
- Iteration 7 reached 95.6% versus 16.4%. All structure passed; the only treatment failure was a preliminary phrase describing the unsafe source instead of using only the safe label.
- Iteration 8 reached 100.0% versus 21.4%. The exact working line, safe-source substitution before drafting, both source ledgers, normal schemas, and promotion lifecycle all passed.

The behavior loop exceeded five iterations because the five-iteration cap applies to description optimization, not behavior evaluation. Repeated fresh runs were necessary to eliminate strict, observed contractual failures rather than accepting a favorable earlier sample.

## Evidence and baseline preservation

The accepted baseline transcripts are preserved verbatim in `no-skill-failures/`; their SHA-256 values match the iteration-8 source transcripts. The final static viewer, benchmark JSON, analysis, grading, blind assignments, comparisons, command logs, state captures, and run transcripts remain in the gitignored iteration workspace.

Eval and checker corrections were evidence-driven: unsafe-source assertion C was limited to the eval that actually supplies an unsafe source; common schema assertion I was clarified as normal-mode only because promotion has P3; O3 was narrowed to observable side-effect evidence; and a mechanical count bug was corrected so the deliberately repeated `Sources read` field is expected twice. No contractual behavior was relaxed.
