# GTM ICP SOP rewrite evidence

Date: 2026-08-13

## Scope and compatibility

- `gtm-icp` is one Lifecycle SOP owning an ICP across create, refine/update, delete, and doctor flows.
- New artifacts use `~/.gtm/<org-slug>/icps/<icp-slug>/ICP.md`, including the equivalent path beneath nested organization nodes.
- Existing flat `icps/<icp-slug>.md` artifacts remain visible and are updated or deleted in place; no migration is required.
- Persona, teammate, workspace-lifecycle, account research, segmentation, scoring, and generic advice requests stay outside this skill.

## Untouched snapshot

The paired baseline was exported from base commit `e78b915` before edits and supplied to every baseline executor in the same final iteration as the candidate. SHA-256:

- `SKILL.md`: `306dddea701bab17fb0c48ddeae8fe2976d5a03f0ad29be2e83ae894fb242da0`
- `references/context.md`: `3f6ec7ff642fdc4622612217c6c4a8806cce15cdff0c09ee3e38992b7cc08f50`
- `references/flows.md`: `1e27fe7a784002797dc6132cc05090397a52c1649e99a0cb6cb1f660ada1f052`
- `templates/icp.md`: `646cbe20a18dcf23c394d445c1d142018ba4b5d97fe7031fc2dc9131b7b62459`

## Current-main integration

After the paired runs, the branch rebased onto workspace hierarchy commit `1fd647c`. The final candidate and fixtures now resolve canonical `ORG.md` organization nodes and the node-local member boundary while retaining the benchmarked nested ICP path and legacy flat ICP compatibility. The historical run outputs remain unedited; post-rebase deterministic verification covers the integration delta.

## Paired behavioral benchmark

Executor and grader: `gpt-5.6-sol`; one run per configuration for seven scenarios. Timing and token counts come from Codex `turn.completed` usage.

| Configuration | Assertions | Mean scenario pass rate | Mean time | Mean total tokens |
| --- | ---: | ---: | ---: | ---: |
| Final candidate | 63/63 | 100.0% | 188.879 s | 192,362 |
| Untouched snapshot | 40/63 | 76.9% | 193.522 s | 193,005 |

- Candidate total: 1,346,532 tokens and 1,322.156 seconds; range 69.976–749.036 seconds.
- Snapshot total: 1,351,038 tokens and 1,354.657 seconds; range 66.734–695.807 seconds.
- The candidate passed create, update, delete, doctor, persona near-miss, and hosted-save recovery with no unexplained durable-contract regression.
- The first scored iteration exposed one menu-wording miss and an underspecified unavailable-save recovery. The final revision made the menu and CLI-first recovery choices exact. A deterministic grader correction accepts “verified” as evidence of a healthy doctor rerun and “could not” as unavailable-save wording; it does not weaken filesystem, Git, scope, or byte checks.

## Trigger optimization

- The maintained set has ten realistic positives and ten sibling/near-miss negatives.
- Candidate 0, the incumbent concise description, scored 20/20 overall and 8/8 held-out.
- Candidates 2 and 3 tied but were longer; candidate 1 scored 19/20 and missed the held-out ICP audit phrasing.
- Candidate 0 is the selected `best_description`; its exact text is applied verbatim in frontmatter. Full scores, timing, tokens, and tie-break rationale are in `trigger-optimization.json`.

## Verification commands

- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/quick_validate.py skills/gtm-icp`
- `python3 evals/gtm-icp/scripts/check_compliance.py`
- `python3 evals/gtm-workspace/scripts/test_contract.py`
- `python3 evals/gtm-icp/scripts/run_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-icp-iteration-3" --baseline-skill-root "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/baseline/skills/gtm-icp" --configurations with_skill,baseline_skill --max-workers 4`
- `python3 evals/gtm-icp/scripts/grade_evals.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-icp-iteration-3"`
- `python3 /Users/eliasstravik/.agents/skills/skill-creator/scripts/aggregate_benchmark.py "$PAPERCLIP_RUN_SCRATCH_DIR/eli275/gtm-icp-iteration-3" --skill-name gtm-icp`
- Four calls to `python3 evals/gtm-icp/description/run_classifier.py`, candidate indices 0–3, model `gpt-5.6-sol`, one run per query.

The static review artifact contains Outputs and Benchmark views for the final candidate and untouched snapshot.

Affected `gtm-workspace` regressions passed 9/9 assertions across canonical nested healthy placement and a cancelled stray-placement repair while retaining a legitimate legacy flat persona.
