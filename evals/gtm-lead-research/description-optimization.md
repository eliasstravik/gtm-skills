# gtm-lead-research — description optimization and shipping checklist

Date: 2026-08-02.

## GPT-5.6 substitution and protocol

The skill-creator trigger protocol was preserved, but its model-invoking `run_eval.py`, `run_loop.py`, and `improve_description.py` were not run because they spawn the prohibited `claude` CLI. A local serial Codex ratchet used `gpt-5.6-terra` at low reasoning with the candidate description visible among all nine GTM skills.

The self-reviewed set contains 20 unique queries: ten positives spanning one-off and bulk person research, supplied packets, active-repo context, role/influence and pain hypotheses, outreach preparation, evidence boundaries, promotion, and typo phrasing; ten near-miss negatives spanning lead segmentation, lead scoring, account research, account segmentation, account scoring, ICP/persona definition, setup, CRM writes, and an explicit company-versus-person distinction. The required stratified split is six positive plus six negative train queries and four positive plus four negative test queries. Every query ran three times serially, the cap was five candidate iterations, and the winner was selected by held-out TEST accuracy before TRAIN accuracy.

No Claude-family model, Claude Code, `claude` CLI, Fable model, model-invoking skill-creator script, installed decoy, or command file was used. No `.claude/commands/` directory was created.

## Outcome

Before and winning description were identical:

> Triggers when a user asks to research individual leads or contacts from supplied source packets or a GTM context repository, produce evidence-backed person briefs or outreach preparation, or promote an approved lead-research brief. Not for lead segmentation or scoring, account research, persona definition, setup, or CRM writes.

The candidate conforms to skill-issue's third-person `Triggers when` grammar and remains applied verbatim. TRAIN scored 36/36 and held-out TEST scored 24/24, with zero false positives and zero false negatives. The ratchet stopped after iteration 1 at perfect TEST accuracy; no rewrite was warranted. All 60 isolated decisions remain in the gitignored trigger workspace.

## skill-issue ten-gate checklist

- [x] Every checklist item is checked or marked inapplicable with a reason.
- [x] PLAN, anatomy §2.9, build-loop constraints, concept map, wayfinder context, old read-only reference evidence, shipping text, and preserved baseline failures were read.
- [x] `assertions.md` contains objectively checkable coverage for every contract and observed failure, marks contractual behavior critical, incorporates grader critiques, and maintains failure traceability.
- [x] Exactly one core primitive is used: Recipe.
- [x] The bare core was one H1 plus one Recipe H2 with a flat 18-item imperative list and exactly 20 nonblank body lines.
- [x] Six fresh controlled arms and three blind forced comparisons tested the bare core before the first Details line was added.
- [x] One Details section contains 21 assertion-earned lines covering exact position/source rendering, unsafe-source containment, evidence boundaries, fixed normal schemas, calibration, one-off and bulk contracts, promotion gate/schema/content/reporting, and truthful Git metadata; Details is within 80 lines and the body within 100.
- [x] Overflow Calls are inapplicable: the complete skill fits safely in one file and has no support files.
- [x] Frontmatter name matches the directory; the optimized conforming description is applied verbatim; model-free validation and shipping greps pass.
- [x] Accepted treatment passes all 41 applicable assertions, including every critical assertion; fixtures and eval evidence remain outside the shipping skill.

## Shipping checks

- Model-free `quick_validate.py`: `Skill is valid!`
- Shipping body: 42 nonblank lines; Details: 21 bullets; full body is below 100 lines.
- Shipping grep: zero `$GTM_HOME`, `state.json`, `transcript.md`, scripted-reply, run-directory, grading, or eval-harness language.
- Fixture roots: `AGENTS.md`, `CLAUDE.md`, and `.gitignore` are byte-identical to setup templates; no fixture contains nested Git metadata, machine state, scoring files, or rubrics.
- Trigger ratchet: serial GPT-5.6 execution, TRAIN 36/36, TEST 24/24, no transient probe files.
- Accepted benchmark: treatment 41/41, baseline 9/41; all three blind comparisons select treatment.

Global installation succeeded. The repository and installed `SKILL.md` copies both have SHA-256 `9f4e993ed50bdfe222140e1177a4fa0ec3ea3e3fd438a71dd6f57166dc1bd454`, and `diff -r` reports them byte-identical.
