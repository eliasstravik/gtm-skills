# Full parity record

Date: 2026-08-02. Status: accepted.

All nine GTM skills have passing done-gates, committed evaluation evidence, valid shipping packages, and byte-identical global agent installations. The final all-nine routing smoke passed 36/36 majority decisions and 108/108 individual runs.

## Per-skill done-gates

| Skill | Done-gate commit | With skill | Without skill | Installed |
| --- | --- | ---: | ---: | --- |
| `gtm-setup` | `19ce900` | 39/39 (100%) | 17/39 (43.6%) | byte-identical |
| `gtm-define-icp` | `7ebebc8` | 53/53 (100%) | 29/53 (54.7%) | byte-identical |
| `gtm-define-personas` | `e7944fd` | 53/53 (100%) | 28/53 (52.8%) | byte-identical |
| `gtm-account-segmentation` | `fb24be4` | 41/41 (100%) | 22/41 (53.7%) | byte-identical |
| `gtm-account-scoring` | `0278965` | 45/45 (100%) | 15/45 (33.3%) | byte-identical after Task 10 description repair |
| `gtm-account-research` | `7f7a166` | 40/40 (100%) | 5/40 (12.5%) | byte-identical |
| `gtm-lead-segmentation` | `c495d33` | 42/42 (100%) | 17/42 (40.5%) | byte-identical |
| `gtm-lead-scoring` | `5da3b28` | 45/45 (100%) | 14/45 (31.1%) | byte-identical |
| `gtm-lead-research` | `1ce0b4d` | 41/41 (100%) | 9/41 (22.0%) | byte-identical |

Each numerator is the pooled accepted assertion total, not a model-estimated quality score. The corresponding `evals/<skill>/iteration-N-results.md` records the per-eval scores, iteration history, models, limitations, blind comparison, analyst pass, and autonomous review.

## All-nine routing matrix

The final matrix contains 27 positives, exactly three per skill, plus nine near-miss negatives expecting `NONE`. Each query was judged against all nine installed descriptions simultaneously in three serial runs and resolved by majority vote.

| Matrix slice | Correct majorities | Correct individual runs |
| --- | ---: | ---: |
| Skill positives | 27/27 | 81/81 |
| Out-of-scope negatives | 9/9 | 27/27 |
| **Total** | **36/36** | **108/108** |

The first smoke exposed a real false positive: numeric scoring-rubric authoring routed to `gtm-account-scoring` by 2/3. Its description was repaired through the prescribed GPT-5.6 trigger ratchet: original TRAIN 36/36 and TEST 23/24; conforming winner TRAIN 36/36 and TEST 24/24. The winner was installed and the entire matrix reran from fresh checkpoints. The accepted catalog was unanimous on every query, including 3/3 `NONE` for numeric-rubric authoring. Full evidence is in `evals/all-nine-trigger-smoke/`.

## Honest model record

Tasks 0–1 were built and evaluated on `claude-fable-5`. Task 1's description optimization also used `claude-fable-5`. This is historical provenance recorded by the prior session; it is not described as GPT-5.6 work.

Tasks 2–9 were built and autonomously reviewed with `gpt-5.6-sol` at high reasoning. Their with-skill and baseline executor arms used `gpt-5.6-terra` at medium reasoning. Independent graders used `gpt-5.6-sol` at high reasoning, except one Task 2 strengthened-assertion regrade used `gpt-5.6-sol` at medium reasoning. Blind comparators used `gpt-5.6-terra` at high reasoning. Benchmark analysts used `gpt-5.6-terra` at high reasoning except Task 6, whose analyst used `gpt-5.6-sol` at high reasoning. Description-routing ratchets used `gpt-5.6-terra` at low reasoning. Task 2 also used `gpt-5.6-sol` at high reasoning for a blind-verdict review and mechanics probes. Each accepted per-skill record is the authoritative role-level ledger.

Task 10 matrix design, audit, repair judgment, evidence review, and this parity record used `gpt-5.6-sol` at high reasoning. Its 108 accepted smoke runs and the 120-decision account-scoring description repair used `gpt-5.6-terra` at low reasoning. Three read-only Task 10 audits used `gpt-5.6-sol` at high reasoning. Validators, aggregation, Git/SHA checks, static-review generation, and file comparisons were model-free.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or prohibited model-invoking skill-creator script was invoked in Tasks 2–10. Sanctioned model-free Python files under a `~/.claude/skills/` directory were used only as files; that directory name is not model usage. This record intentionally does not repeat the old reference repository's inaccurate all-no-Claude claim.

## Contract and evidence audit

- Every shipping `SKILL.md` passes the model-free quick validator and every globally installed agent copy recursively matches its repository source.
- Shipping directories contain installer payloads only. Evaluation conventions, transcripts, scripted replies, run-directory markers, and grading language remain outside shipping skills.
- Scoring uses qualitative fit Bands with no rubric files and no arithmetic. Segmentation and scoring remain separate routes.
- No shipping mechanism uses `$GTM_HOME`, registries, pins, or machine state. Any shipping mention of `state.json` names only the obsolete defect to remove; it does not reinstate that mechanism.
- Task 2–10 evaluations did not access the real `~/.gtm`, a real context repository, or home configuration. Task 1's iteration-1 baseline isolation leak and broken parallel trigger probe remain honestly documented in its evidence; neither recurred.
- Token totals were not exposed by the active completion interface, so Tasks 2–10 timing evidence uses measured wall clock and records tokens as unavailable rather than estimating them.
- Earlier Task 3 and Task 4 iteration summaries were consolidated into their accepted results files during Task 10 so every skill now follows PLAN G6's one-`iteration-N-results.md` committed shape without losing benchmark or change history.

Publishing and the final disposition of the old reference repository remain client decisions. This build does not publish, push, archive, or delete them.
