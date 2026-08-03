# gtm-define-personas — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The sanctioned skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 queries: ten positives spanning create, refine, stakeholder/buyer phrasing, child ownership, exact-preview wording, typos, and bad-fit guidance; ten near-miss negatives spanning all sibling task families and a no-action summary. It uses the required stratified 60/40 split: six positive plus six negative train queries, four positive plus four negative test queries. Every query ran three times, serially, with a five-iteration cap and test accuracy as the winner criterion.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used. No probe installed a skill, decoy, or command file.

## Outcome

Before and winning description were identical:

> Triggers when a user asks to create, define, or refine a buyer or stakeholder persona in a GTM context repository.

The candidate conforms to skill-issue's third-person `Triggers when` grammar and was applied verbatim. Train scored 36/36 decisions with 18 true positives, 18 true negatives, zero false positives, and zero false negatives. Held-out test scored 24/24 with 12 true positives, 12 true negatives, zero false positives, and zero false negatives. The ratchet therefore stopped after iteration 1 at perfect test accuracy; no rewrite was warranted.

The run-level summary and all 60 isolated decisions remain in the gitignored `skills/gtm-define-personas-workspace/trigger-ratchet/`. The committed query set is `trigger-eval.json`.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] Requirements, anatomy, constraints, old reference evidence, shipping text, and preserved baseline failures were read; accepted no-skill transcripts prove the need.
- [x] `assertions.md` has one objectively checkable assertion for every contract and observed failure, with contractual behavior marked critical and a maintained traceability table.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2, a flat ordered list with one imperative per item and 19 nonblank body lines, within the 20-line limit.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains eight assertion-earned lines; it is within the 80-line Details and 100-line body limits.
- [x] Overflow Calls are not applicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized third-person description is applied verbatim; `quick_validate.py` and manual shipping checks pass.
- [x] Accepted treatment passes all 53 assertions, including every critical assertion; eval evidence stays outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body: 28 nonblank lines total, including eight Details bullets; full file: 37 lines.
- Shipping grep: zero `$GTM_HOME`, `state.json`, transcript, scripted-reply, run-directory, grading, or eval-harness language.
- Global install: `npx skills add ... --skill gtm-define-personas -g` installed the agent copy; `npx skills list -g` lists it and recursive diff is byte-identical.
- Installer caveat: the installer also reported that PromptScript does not support global skill installation. This did not affect the successful `~/.agents/skills/gtm-define-personas` copy.
