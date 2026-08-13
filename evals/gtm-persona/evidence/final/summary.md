# GTM Persona SOP rewrite evidence

Date: 2026-08-13

## Scope and compatibility

- `gtm-persona` is one Lifecycle SOP owning a persona across create, refine/update, delete, and doctor flows.
- New artifacts use `~/.gtm/<org-slug>/personas/<persona-slug>/PERSONA.md`, including the equivalent path beneath nested organization nodes.
- Existing flat `personas/<persona-slug>.md` artifacts remain visible and are updated or deleted in place; no migration is required.
- ICP, teammate, workspace-lifecycle, lead research, segmentation, scoring, generic advice, and fictional-avatar requests stay outside this skill.

## Untouched snapshot

The paired baseline was exported from base commit `e78b915` before edits and supplied to every baseline executor in the same final iteration as the candidate. SHA-256:

- `SKILL.md`: `9f0c32ba09e8687a1e12b207ada10dd8f999c699a52e32bec5068e2909fc7ce6`
- `references/context.md`: `66ec553a4a5b1d59ee9e2dc495d207a17b57ab1737d9a77f500adf26a686e76b`
- `references/flows.md`: `d67ac0a085c3563c0a9c5b4afe368fb3364c1470cb1fb9f45ee3dfdbb97a31e2`
- `templates/persona.md`: `60c289a3500069c9c8643973bf480b6a8cc875de4c482df30bfa1904cec7709c`

## Current-main integration

After the paired runs, the branch rebased onto workspace hierarchy commit `1fd647c`. The final candidate and fixtures now resolve canonical `ORG.md` organization nodes and the node-local member boundary while retaining the benchmarked nested persona path and legacy flat persona compatibility. The historical run outputs remain unedited; post-rebase deterministic verification covers the integration delta.

## Paired behavioral benchmark

Executor and grader: `gpt-5.6-sol`; one run per configuration for seven scenarios. Timing and token counts come from Codex `turn.completed` usage.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean total tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 61/61 | 100.0% | 158.630 s | 216,827 |
| Untouched snapshot | 42/61 | 84.0% | 233.651 s | 186,741 |

- Candidate total: 1,517,787 tokens and 1,110.411 seconds; range 71.812–404.639 seconds.
- Snapshot total: 1,307,188 tokens and 1,635.554 seconds; range 72.631–720.098 seconds.
- The candidate passed create, update, delete, doctor, ICP near-miss, and hosted-save recovery with no unexplained durable-contract regression.
- The first scored iteration exposed an underspecified unavailable-save recovery. The final revision made the CLI-first recovery choice exact. A deterministic grader correction accepts “could not” as unavailable-save wording; it does not weaken filesystem, Git, scope, or byte checks.

## Trigger optimization

- The maintained set has ten realistic positives and ten sibling/near-miss negatives.
- Candidate 0, the incumbent concise description, scored 20/20 overall and 8/8 held-out.
- Candidates 1 and 2 tied but were longer; candidate 3 scored 18/20 and missed guided-menu and library-repair positives.
- Candidate 0 is the selected `best_description`; its exact text is applied verbatim in frontmatter. Full scores, timing, tokens, and tie-break rationale are in `trigger-optimization.json`.

## Verification commands

- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/quick_validate.py skills/gtm-persona`
- `python3 evals/gtm-persona/scripts/check_compliance.py`
- `python3 evals/gtm-workspace/scripts/test_contract.py`
- `python3 evals/gtm-persona/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-persona-iteration-3" --baseline-skill-root "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/baseline/skills/gtm-persona" --configurations with_skill,baseline_skill --max-workers 4`
- `python3 evals/gtm-persona/scripts/grade_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-persona-iteration-3"`
- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/aggregate_benchmark.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-persona-iteration-3" --skill-name gtm-persona`
- Four calls to `python3 evals/gtm-persona/description/run_classifier.py`, candidate indices 0–3, model `gpt-5.6-sol`, one run per query.

The static review artifact contains Outputs and Benchmark views for the final candidate and untouched snapshot.

Affected `gtm-workspace` regressions passed 9/9 assertions across canonical nested healthy placement and a cancelled stray-placement repair while retaining a legitimate legacy flat persona.
