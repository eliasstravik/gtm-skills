# gtm-setup — description optimization record

Date: 2026-08-02. Loop: skill-creator `run_loop.py`, model `claude-fable-5`,
`--max-iterations 5 --report none`, run from the repo root (transient
`.claude/commands/` probe files created by the harness were cleaned up; none
committed). Eval set: `trigger-eval.json` (20 queries, 10 positive / 10
negative), authored and self-reviewed under the PLAN §G5 autonomous waiver —
positives cover all seven Switch rows with varied phrasing/typos; negatives are
near-misses (sibling gtm skills, generic git repos, a non-GTM `state.json`, a
wiki "suborg", CRM onboarding).

## Outcome: original description kept (G5 conforming-candidate fallback)

**Before and after (identical, applied verbatim):**

> Triggers when a user wants to create or import a GTM context repo, add a
> suborg or person to one, validate or repair one, or when another GTM skill
> cannot resolve its context. Not for defining ICPs or personas, segmenting,
> scoring, or researching accounts or leads.

## Why the optimizer's winner was not applied

1. **Probe bias (measurement, not description):** across 4 completed
   iterations, every candidate — including the original and two much more
   explicit rewrites — scored exactly 100% precision / **0% recall** / 50%
   accuracy on both train and test splits. Not one positive query triggered in
   any of ~120 probe runs, including "set up a fresh GTM context repo for my
   startup ferrostack right here in this directory". Two independent
   descriptions measuring literal zero on unambiguous positives indicts the
   probe harness: `run_eval.py` runs up to 10 parallel `claude -p` probes,
   each installing its own uniquely-named `gtm-setup-skill-<hash>` decoy
   command file, and the concurrent decoys split/suppress trigger detection.
   The reference repo recorded the same bias for this same skill
   (`research/gtmskills-anatomy.md` §2.1). With recall pinned at 0 for every
   candidate, the loop's test-score selection carries no information.
2. **Grammar:** every improver-proposed candidate led with "Use this skill…"
   — violating the G4 rule that model-invoked descriptions start with
   `Triggers when`. Per PLAN §G5's jurisdiction rule, a non-conforming winner
   is never applied; the best *conforming* candidate in the run's history is
   the original description, which also ties every non-conforming candidate
   on measured accuracy (50%).
3. **Run integrity, honestly reported:** the loop was interrupted twice by
   session teardown (first attempt died in iteration 2; second completed
   iterations 1–4 and died improving toward 5). Logs preserved in the
   workspace (`run_loop_output.log`, `run_loop_output2.log`). Stray probe
   command files were removed after each interruption; none were committed.

Real-world trigger accuracy for this skill is additionally gated by Task 10's
all-nine routing matrix (single-judge, no parallel decoys), acceptance 36/36.

## Validation gates (skill-issue checklist, recorded per gate 9/10)

1. Every box checked or N/A with reason — **pass** (see below).
2. Requirements, assertions, preserved failures, and reference skill text read;
   ≥1 preserved baseline failure proves need — **pass**
   (`no-skill-failures/`: 4 files across both iterations).
3. One checkable assertion per required behavior/preserved failure; contractual
   ones critical — **pass** (`assertions.md`: A–P + A2, 11 critical, with
   failure→assertion traceability table).
4. Exactly one core primitive — **pass** (Switch: routes condition→flow,
   retains ownership; the task-mandated primitive).
5. Bare core = H1 + Switch table, ≤20 body lines — **pass** (13 lines at
   iteration 1).
6. Fresh with/without runs + blind forced comparison on the bare core before
   any Details line — **pass** (iteration 1: 6 runs; blind comparator won 3/3
   for with-skill; assignment key preserved).
7. One Details section, every line traceable to a failed assertion, ≤80
   Details / ≤100 total body lines — **pass** (6 Details lines ← F, H, L, A2 +
   two Calls anchored to F/H; body 22 lines).
8. Overflow via one-level Calls with explicit triggers/outputs/fallbacks —
   **pass** (two `read … when …; if unavailable …` lines).
9. Frontmatter fits invocation mode; validator results recorded — **pass**
   (`name` + `description` only; description `Triggers when`-led, third
   person, exclusions stated; `quick_validate.py`: "Skill is valid!").
10. Full treatment passes every critical assertion; optimized description
    applied verbatim; eval evidence outside the shipping skill — **pass**
    (iteration 2: 39/39; description per fallback above; all evidence in
    `evals/gtm-setup/`, shipping dir contains only SKILL.md, references/,
    templates/).
