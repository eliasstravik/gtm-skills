# gtm-account-research — iteration 3 results

Date: 2026-08-02. Status: accepted; every critical and noncritical treatment assertion passed.

## Accepted benchmark

| Eval | With skill | Baseline | Delta |
| --- | ---: | ---: | ---: |
| 1 — conflicting headcounts | 12/12 (100%) | 1/12 (8.3%) | +91.7 pp |
| 2 — bulk private source | 14/14 (100%) | 3/14 (21.4%) | +78.6 pp |
| 3 — child promotion | 14/14 (100%) | 1/14 (7.1%) | +92.9 pp |
| **Assertion total** | **40/40 (100%)** | **5/40 (12.5%)** | **+87.5 pp** |

The stock skill-creator aggregate reports 100.0% treatment versus 12.3% baseline because it macro-averages the three eval pass rates rather than weighting all 40 assertions. Mean executor wall-clock time was 96.7 seconds with the skill and 64.7 seconds without it. The stock renderer says “3 runs each per configuration,” but this benchmark has three distinct evals with one run per arm, not three repetitions of each eval; no repeatability inference is claimed.

## Exact models and roles

| Role | Model | Reasoning | Scope |
| --- | --- | --- | --- |
| Primary builder and self-reviewer | `gpt-5.6-sol` | high | Skill, fixtures, assertions, harness, evidence, and final judgment |
| Treatment executors | `gpt-5.6-terra` | medium | Three with-skill runs per iteration |
| Baseline executors | `gpt-5.6-terra` | medium | Three no-skill runs per iteration |
| Independent graders | `gpt-5.6-sol` | high | Every treatment and baseline run |
| Blind comparators | `gpt-5.6-terra` | high | Three iteration-1 neutral A/B comparisons before Details |
| Benchmark analyst | `gpt-5.6-sol` | high | Direct-artifact audit of accepted iteration 3 |
| Trigger router | `gpt-5.6-terra` | low | 60 serial routing decisions |
| Mechanical checks and aggregation | no model | n/a | Local Python and Git evidence |

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used. Model-free Python utilities under the skill-creator directory were used as sanctioned. Codex CLI subprocess completion did not expose collaboration-notification token counts, so every `timing.json` records zero tokens plus honest wall-clock duration and that limitation.

## Iteration history

| Iteration | Treatment | Baseline | Change and reason |
| --- | ---: | ---: | --- |
| 1 — bare core | 15/40 (37.5%) | 5/40 (12.5%) | Established response-only safety, segment preservation, evidence attribution, private-link suppression, correct physical promotion target, preview-byte identity, and target-only commit. Failed exact position casing, literal source/schema fields, conflict calibration, fixed bulk opening, exact safe label, exact promotion schema/gate sentence, and final metadata. |
| 2 — earned Details | 38/40 (95.0%) | 6/40 (15.0%) | Added only assertion-earned rules for exact sources and evidence boundaries, fixed fields, priority/confidence calibration, safe-label exclusivity, bulk schema, exact no-effects statement, sixteen-H2 promotion schema, and persistence reporting. One-off and bulk reached 100%; promotion omitted one inherited source path and renamed final metadata labels. |
| 3 — accepted | 40/40 (100%) | 5/40 (12.5%) | Required every inspected inherited source in `Sources read`, added literal `Account` inside the promoted artifact, and mandated exact final promotion metadata labels. All treatment assertions and mechanical checks passed. |

Iteration-1 blind comparison selected treatment for all three evals despite its defects: treatment won as A in eval 1, as B in eval 2, and as A in eval 3. Assignment keys were revealed only after comparator verdicts. Accepted baseline transcripts are preserved verbatim in `no-skill-failures/`.

## Accepted mechanical evidence

- Normal research: executor exit zero, exact position before conclusions, identical before/after fixture SHA-256 manifests, unchanged HEAD, clean status/index, one baseline commit only, no forbidden home access, and every Git command anchored with `git -C`.
- Private source: the assistant transcript, command log, copied context, and generated artifacts contain no host, query, token, or sanitized URL variant; the only representation is `Private source withheld`.
- Promotion: target is only `suborgs/emea/research/baltic-ledger.md`; the complete fenced preview and written bytes share SHA-256 `9ab61ed10731fac51310129dd3c0b9151c330e42283fe582b3eeb16af94a8f6e`; H1 and all sixteen H2s are exact; the interaction record contains the exact scripted approval once; only the owned file changed; history is fixture baseline plus one non-amending commit; index and worktree are clean; no remote or push exists.

## Analyst and self-review

The independent analyst confirmed that direct evidence supports the exact-contract 100% treatment score and highlighted appropriate limits: one heterogeneous sample per eval, composite assertions, unavailable token/tool metrics, stock aggregation wording, and a 32-second mean treatment overhead. It also noted calibration tensions where prescribed booleans coexist with ordinary discovery questions; those are not hidden failures because the assertions deliberately distinguish material decision evidence from routine next-step validation.

After the static review was generated, every accepted treatment and baseline transcript was read directly. The final treatment stays within supplied evidence: the three-market consolidation fact remains unnamed in inspected findings; country-specific pain language is explicitly hypothetical; unsafe source material is neither opened nor reproduced; normal modes have no gate or mutation; and promotion consumes approval once and reports the exact committed artifact. No further assertion or Details line was justified after that review.

## Deviations and limitations

- The prohibited model-invoking skill-creator scripts were replaced with GPT-5.6 Codex CLI executors, graders, comparators, analyst, and a serial trigger ratchet while preserving the evaluation protocol.
- Collaboration subagent completion notifications were unavailable under the active harness policy. Six arms still launched concurrently in one awaited shell session; wall-clock timing was captured locally and token counts were reported as unavailable rather than estimated.
- The stock static viewer generated successfully but its layout does not fully discover this custom executor transcript structure. Direct transcripts, graders, mechanical checks, and the analyst record remain the judgment source.
