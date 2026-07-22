# gtm-setup — description optimization + shipping checks

Date: 2026-07-21. Loop: skill-creator `run_loop.py`, model claude-fable-5,
client-approved 20-query set (`trigger-eval.json`), 60/40 train/test split,
5 iterations, 3 runs per query.

## Outcome

`best_description` (selected by test score) = **the existing description,
unchanged** (iteration 1). Applied verbatim per plan Decision 9.

Scores: train 7/12, test 4/8. Precision was high across iterations (negatives
almost never triggered — 0/3 on nearly all near-misses); recall was low
everywhere (8–17%): in the one-shot `claude -p` probe, even strong positives
often didn't consult the skill. Pushier candidate descriptions generated in
iterations 2–5 did not beat the original on the held-out test split.

Caveats recorded:
- The probe registers candidates as temporary `.claude/commands/` files; some
  persisted transiently during the run, creating near-duplicate decoys that
  can split trigger detection away from the probe's target id — a bias
  against later iterations. Absolute recall numbers are therefore a floor,
  not a truth.
- The honest end-to-end signal is the post-install smoke-trigger check (below)
  and the all-nine trigger smoke pass at full parity (plan implementer note).

## Manual frontmatter check (agentskills validate unavailable)

- `name: gtm-setup` — matches directory name; lowercase letters and single
  hyphens only. PASS
- `description` — present, third person, triggering conditions; owned by the
  optimizer output (unchanged by hand). PASS
- No unsupported extension fields; no `disable-model-invocation` (skill is
  model-invoked). PASS
- Body: 54 lines (core Switch section 16 ≤ 20; Details ≤ 80; total ≤ 100).
  One primitive in the core. PASS
