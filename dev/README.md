# GTM Skills Dev Area

This directory holds committed eval sources and fixtures for the GTM skill
library. Generated eval outputs stay out of git.

## Layout

- `dev/evals/<skill>/evals.json` is the committed skill-creator eval source.
- `dev/evals/<skill>/trigger-eval.json` is the committed trigger-description
  eval set for that skill.
- `dev/evals/fixtures/gtm-home/` is the hermetic `$GTM_HOME` seed used by eval
  runs.
- `dev/runs/<skill>/` is gitignored and contains run dirs, iteration outputs,
  viewer feedback, benchmark files, and snapshots.

## Skill-Creator Result Shape

`aggregate_benchmark.py` only discovers iteration results with this shape:

```text
dev/runs/<skill>/iteration-N/
  eval-0/
    eval_metadata.json
    with_skill/
      run-1/
        grading.json
        timing.json
    without_skill/
      run-1/
        grading.json
        timing.json
  eval-1/
    ...
```

Use `eval-*` directories directly under `iteration-N`. Each configuration
directory must contain `run-*` directories, and each run directory must contain
`grading.json`. Descriptive eval names belong in `eval_metadata.json`, not in a
directory name that replaces the `eval-*` prefix.

## Hermetic GTM Context

Every eval run sets `$GTM_HOME` to a per-run directory under
`dev/runs/<skill>/iteration-N/eval-*/<config>/run-*/gtm-home`. Seed that
directory from `dev/evals/fixtures/gtm-home` before the run. Eval runs never
read or write live `~/.gtm`.

When the context contract changes, regenerate `dev/evals/fixtures/gtm-home/`
by running the current branch's `gtm-setup` flow into a scratch root, then
copying only committed-safe fixture files here. The fixture must contain
usable ICPs, personas, account criteria, and lead criteria so downstream evals
never depend on live context.

## Description Doctrine

Descriptions stay lean. Start with one trigger per real branch, then run the
trigger-description optimization loop. Treat `best_description` as a diagnostic
candidate, not an automatic replacement: lean-edit it, re-score on the held-out
set, and keep the leaner version unless removing a phrase causes a measured
undertrigger. Near-ties go to the leaner description.

Trigger negative sets must include entity twins and nearest siblings. For
example, account scoring negatives include lead scoring, account research, and
account segmentation prompts.
