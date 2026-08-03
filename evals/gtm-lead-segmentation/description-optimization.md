# gtm-lead-segmentation — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 queries: ten positives spanning one-off and bulk contact segmentation, classification, routing, bucketing, qualification, child visibility, title-only ambiguity, responsibility-first matching, and typo phrasing; ten near-miss negatives spanning lead scoring, lead research, persona definition, account segmentation/scoring/research, setup, and combined account workflows. It uses the required stratified 60/40 split: six positive plus six negative train queries, four positive plus four negative test queries. Every query ran three times serially, with a five-iteration cap and held-out TEST accuracy as the winner criterion.

No Claude-family model, Claude Code, `claude` CLI, Fable model, model-invoking skill-creator script, installed decoy, or command file was used. No `.claude/commands/` directory was created.

## Outcome

Before and winning description were identical:

> Triggers when a user asks to classify, segment, route, bucket, or qualify individual leads or contacts against visible GTM personas.

The candidate conforms to skill-issue’s third-person `Triggers when` grammar and remains applied verbatim. TRAIN scored 36/36 decisions and held-out TEST scored 24/24, with zero false positives and zero false negatives in both splits. The ratchet stopped after iteration 1 at perfect TEST accuracy; no rewrite was warranted under the test-first selection rule. Run-level evidence for all 60 isolated decisions remains in the gitignored `skills/gtm-lead-segmentation-workspace/trigger-ratchet/`.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] PLAN, anatomy §2.7, build-loop constraints, concept map, wayfinder context, old read-only reference evidence, the shipping draft, and accepted baseline failures were read.
- [x] `assertions.md` has an objectively checkable assertion for every contract and observed failure, contractual behavior is marked critical, grader critiques were resolved, and the failure traceability table is maintained.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2 with a flat 12-item imperative list and 14 nonblank body lines, within the 20-line bare-core limit.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains 11 assertion-earned lines covering canonical paths, exact working/metadata rendering, literal confidence/review values, preserved unknowns, single complete source reporting, non-interaction narration, losing-persona reasoning, root metadata, evidence boundaries, and exhaustive supplied-fact citation; Details is within 80 lines and the body within 100.
- [x] Overflow Calls are inapplicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized conforming description is applied verbatim; model-free validation and shipping greps pass.
- [x] Accepted treatment passes all 42 assertions, including every critical assertion; fixtures and all eval evidence stay outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body remains under 100 lines; Details contains 11 bullets.
- Shipping grep: zero `$GTM_HOME`, `transcript.md`, scripted-reply, run-directory, grading, or other eval-harness language; zero `state.json` occurrences.
- Fixture root files: `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical to `skills/gtm-setup/templates/`; no fixture contains machine state or nested Git metadata.
- Trigger ratchet: serial GPT-5.6 execution, TRAIN 36/36, TEST 24/24, no probe files.
- Global install: `npx skills add /Users/eliasstravik/dev/gtmskills-omni --skill gtm-lead-segmentation -g` installed the agent copy; recursive diff is byte-identical and both `SKILL.md` copies have SHA-256 `3d60fd058dcaead0b494beb6b56d54b9777a31058581aed168d13783f3c47fa8`.
- Installer caveat: the installer also reported that PromptScript does not support global skill installation. This did not affect the successful `~/.agents/skills/gtm-lead-segmentation` copy.
