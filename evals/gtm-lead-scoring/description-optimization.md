# gtm-lead-scoring — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 unique queries: ten positives spanning score/rank/qualify/prioritize wording, one-off and bulk leads, direct `no-match`, child ownership, named persona content/disqualifiers, response-only output, existing persona labels, and typo phrasing; ten near-miss negatives spanning lead segmentation, lead research, account scoring, account research, persona definition, setup, generic non-persona ranking, and no-action summarization. It uses the required stratified 60/40 split: six positive plus six negative train queries, four positive plus four negative test queries. Every query ran three times serially, with a five-iteration cap and TEST accuracy as the winner criterion.

No Claude-family model, Claude Code, `claude` CLI, Fable model, or model-invoking skill-creator script was used. No probe installed a skill, decoy, or command file.

## Outcome

Before and winning description were identical:

> Triggers when a user asks to score, rank, qualify, or prioritize individual leads against visible personas using existing persona labels in a GTM context repository. Not for assigning persona labels.

The candidate conforms to skill-issue's third-person `Triggers when` grammar and remains applied verbatim. TRAIN scored 36/36 decisions and held-out TEST scored 24/24 decisions, with zero false positives and zero false negatives in both splits. The ratchet stopped after iteration 1 at perfect TEST accuracy; no rewrite was permitted or warranted under the test-first selection rule.

The run-level summary and all 60 isolated decisions remain in the gitignored `skills/gtm-lead-scoring-workspace/trigger-ratchet/`. The committed, self-reviewed query set is `trigger-eval.json`. No transient `.claude/commands/`, probe, or command file was created.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] Requirements, anatomy, constraints, scoring decisions, old reference evidence, shipping text, and preserved baseline failures were read; accepted no-skill transcripts prove the need.
- [x] `assertions.md` has one objectively checkable assertion for every contract and observed failure, with contractual behavior marked critical and a maintained traceability table.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2 and a flat 16-item ordered list, with 18 nonblank body lines within the 20-line bare-core limit.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains seven assertion-earned lines: exact boolean/no-effects wording (J), verbatim matched persona sentences (O2/P3), category-by-category rationale (H), verbatim disqualifier and cap language (B3), persona-maintenance question isolation (I), physical/canonical child-path distinction (A), and declarative missing-fact gaps (D/B4). It is within the 80-line Details and 100-line body limits.
- [x] Overflow Calls are inapplicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized third-person description is applied verbatim; `quick_validate.py` and manual shipping checks pass.
- [x] Accepted treatment passes all 45 assertions, including every critical assertion; eval evidence stays outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body: 26 nonblank lines total, including seven Details bullets; full file: 35 lines.
- Shipping grep: zero `$GTM_HOME`, `state.json`, transcript, scripted-reply, run-directory, grading, or eval-harness language.
- Fixture contract: `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical to the setup templates; no fixture contains a rubric, scoring file, state file, nested Git metadata, or machine state.
- Global install: `npx skills add ... --skill gtm-lead-scoring -g` installed the agent copy; recursive diff is byte-identical (`4cb5ce7436c3a717e06e9f5a774b6d67fd8f67bce16bd11cd8d90f89a0a89cd7` for both `SKILL.md` copies).
- Installer caveat: the installer also reported that PromptScript does not support global skill installation. This did not affect the successful `~/.agents/skills/gtm-lead-scoring` copy.
