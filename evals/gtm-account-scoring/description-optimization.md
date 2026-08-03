# gtm-account-scoring — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The sanctioned skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 queries: ten positives spanning score/rank/qualify/prioritize wording, one-off and bulk inputs, direct `no-match`, child ownership, named signals/disqualifiers, response-only output, existing segment labels, and typo phrasing; ten near-miss negatives spanning account segmentation, account research, lead scoring, lead research, ICP definition, setup, generic non-ICP ranking, and numeric-rubric authoring. It uses the required stratified 60/40 split: six positive plus six negative train queries, four positive plus four negative test queries. Every query ran three times serially, with a five-iteration cap and TEST accuracy as the winner criterion.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used. No probe installed a skill, decoy, or command file.

## Initial Task 5 outcome

Before and winning description were identical:

> Triggers when a user asks to score, rank, qualify, or prioritize accounts against visible ICPs using existing segment labels in a GTM context repository. Not for assigning segment labels.

The candidate conformed to skill-issue's third-person `Triggers when` grammar and was applied verbatim. TRAIN scored 36/36 decisions and held-out TEST scored 24/24 decisions, with zero false positives and zero false negatives in both splits. The Task 5 ratchet stopped after iteration 1 at perfect TEST accuracy.

The run-level summary and all 60 isolated decisions remain in the gitignored `skills/gtm-account-scoring-workspace/trigger-ratchet/`. The committed, self-reviewed query set is `trigger-eval.json`. No transient `.claude/commands/`, probe, or command file was created.

## Task 10 all-nine repair

The first Task 10 smoke exposed one boundary that the original Task 5 set did not test: the request `Design a weighted 100-point account-scoring rubric with numeric component weights and save it as account-scoring.md.` selected `gtm-account-scoring` in two of three runs. That is outside this skill's deliberately qualitative, no-rubric, no-arithmetic contract. The failing request replaced the held-out no-action summarization negative as `n10`; the 10-positive/10-negative and stratified 60/40 protocol stayed unchanged.

The serial all-nine GPT-5.6 ratchet compared the original description with conforming candidates. The original scored TRAIN 36/36 and TEST 23/24 because of one false-positive rubric decision. Iteration 2 scored TRAIN 36/36 and TEST 24/24, so TEST-first selection stopped and applied this winner verbatim:

> Triggers when a user asks to score, rank, qualify, or prioritize accounts against visible ICPs using existing segment labels in a GTM context repository. Not for assigning segment labels, authoring scoring rubrics or point systems, or numeric scoring and arithmetic.

The repair used `gpt-5.6-terra` at low reasoning for all 120 routing decisions. It ran serially with the candidate visible among all nine installed descriptions; each query ran three times, the split was frozen, the iteration cap was five, and held-out TEST score selected the winner. Run checkpoints and the summary remain in gitignored `skills/gtm-account-scoring-workspace/trigger-ratchet-task10/`. The repaired description was reinstalled before the entire 36-query smoke was rerun from fresh checkpoints. The final smoke passed 36/36 majority decisions and 108/108 individual runs, including three unanimous `NONE` decisions for the rubric request.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or prohibited model-invoking skill-creator script was used in the repair. No transient command file was created.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] Requirements, anatomy, constraints, scoring decisions, old reference evidence, shipping text, and preserved baseline failures were read; accepted no-skill transcripts prove the need.
- [x] `assertions.md` has one objectively checkable assertion for every contract and observed failure, with contractual behavior marked critical and a maintained traceability table.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2, a flat ordered list with one imperative per item and 15 nonblank body lines, within the 20-line bare-core limit.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains seven assertion-earned lines: position identity/rendering (A), booleans and no-effects wording (J/O3), explicit absent-signal calibration (I/B5), direct `no-match` calibration (I/B5), disqualifier-cap wording (B3), Band boundary semantics (B2/B5), and verbatim signal/disqualifier names (O2). It is within the 80-line Details and 100-line body limits.
- [x] Overflow Calls are inapplicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized third-person description is applied verbatim; `quick_validate.py` and manual shipping checks pass.
- [x] Accepted treatment passes all 45 assertions, including every critical assertion; eval evidence stays outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body: 24 nonblank lines total, including seven Details bullets; full file: 33 lines.
- Shipping grep: zero `$GTM_HOME`, `state.json`, transcript, scripted-reply, run-directory, grading, or eval-harness language.
- Fixture contract: template root files are byte-identical; no fixture contains a rubric, scoring file, state file, nested Git metadata, or machine state.
- Global install: `npx skills add ... --skill gtm-account-scoring -g` installed the repaired agent copy; recursive diff is byte-identical (`a0653604e722389c9cc2ebedaadce40f87efe5305be58c6c9ec0c94f52b92a14` for both `SKILL.md` copies).
- Installer caveat: the installer also reported that PromptScript does not support global skill installation. This did not affect the successful `~/.agents/skills/gtm-account-scoring` copy.
