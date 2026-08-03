# gtm-account-segmentation — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The sanctioned skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 queries: ten positives spanning one-off, bulk, exact-label/no-match routing, child precedence, typo phrasing, qualifying, response-only wording, reseller disqualification, bucketing, and inherited/local visibility; ten near-miss negatives spanning account scoring/research, lead segmentation/scoring/research, ICP/persona definition, setup, and no-action summarization. It uses the required stratified 60/40 split: six positive plus six negative train queries, four positive plus four negative test queries. Every query ran three times serially, with a five-iteration cap and TEST accuracy as the winner criterion.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used. No probe installed a skill, decoy, or command file.

## Outcome

Before and winning description were identical:

> Triggers when a user asks to classify or segment accounts against visible ICPs in a GTM context repository.

The candidate conforms to skill-issue's third-person `Triggers when` grammar and was applied verbatim. Held-out TEST scored 24/24 decisions with 12 true positives, 12 true negatives, zero false positives, and zero false negatives. The ratchet therefore stopped after iteration 1 at perfect TEST accuracy; no rewrite was permitted or warranted under the test-first selection rule.

TRAIN scored 33/36 with 18 true positives, 15 true negatives, three false positives, and zero false negatives. All three false positives came from one deliberately ambiguous query, “Score and rank these accounts from strong-fit to no-fit against our existing ICPs,” while the catalog's current account-scoring description requires an existing scoring rubric. The held-out scoring near-miss named the rubric and routed correctly 3/3. This caveat is retained honestly; Task 5 will optimize the final scoring description, and Task 10 will retest score-vs-segment queries against all nine final descriptions.

The run-level summary and all 60 isolated decisions remain in the gitignored `skills/gtm-account-segmentation-workspace/trigger-ratchet/`. The committed query set is `trigger-eval.json`.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] Requirements, anatomy, constraints, old reference evidence, shipping text, and preserved baseline failures were read; accepted no-skill transcripts prove the need.
- [x] `assertions.md` has one objectively checkable assertion for every contract and observed failure, with contractual behavior marked critical and a maintained traceability table.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2, a flat ordered list with one imperative per item and 13 nonblank body lines, within the 20-line bare-core limit.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains ten assertion-earned lines; it is within the 80-line Details and 100-line body limits.
- [x] Overflow Calls are not applicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized third-person description is applied verbatim; `quick_validate.py` and manual shipping checks pass.
- [x] Accepted treatment passes all 41 assertions, including every critical assertion; eval evidence stays outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body: 24 nonblank lines total, including ten Details bullets; full file: 33 lines.
- Shipping grep: zero `$GTM_HOME`, `state.json`, transcript, scripted-reply, run-directory, grading, or eval-harness language.
- Global install: `npx skills add ... --skill gtm-account-segmentation -g` installed the agent copy; `npx skills list -g` lists it and recursive diff is byte-identical (`f0ada0118cbbe7b3a2f5da5b44f5eaf0103e0c92cdb46913771fd898d3b412e4` for both `SKILL.md` copies).
- Installer caveat: the installer also reported that PromptScript does not support global skill installation. This did not affect the successful `~/.agents/skills/gtm-account-segmentation` copy.
