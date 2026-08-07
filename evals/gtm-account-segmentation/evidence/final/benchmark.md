# Skill Benchmark: gtm-account-segmentation

**Model**: gpt-5.6-sol
**Date**: 2026-08-06T07:59:36Z
**Evals**: 1, 2, 3, 4, 5 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 30% ± 9% | +0.70 |
| Time | 52.0s ± 7.4s | 45.0s ± 2.7s | +7.0s |
| Tokens | 3305 ± 1025 | 3009 ± 514 | +296 |

## Notes

- The full skill passes all 33 assertions across five scenarios, while paired no-skill runs pass 10/33 (30.3%); 23 assertions discriminate in favor of the skill and none favor the baseline.
- Both node-local visibility directions are fully green with the skill: the Enterprise bulk run excludes root-only content, and the root run excludes both Enterprise-only ICPs. Their baselines pass only 3/8 and 2/6 respectively.
- The obvious-node and empty-visible-set cases each pass 6/6 with-skill versus 2/6 without-skill, pinning the shared read-only rule: select the sole artifact-owning node automatically, but honor an explicit zero-artifact target and stop without borrowing another node's ICP.
- The bulk case reconciles all three qualified labels with opening counts, compact per-account fields, quoted ICP prose, losing alternatives, and applicable disqualifiers.
- The full skill averages 7.0 more seconds and 296 more measured output tokens per eval than the baseline while improving mean pass rate by 69.6 percentage points.
- Only one artifact run per configuration per eval was used, so within-eval variance is not measured. Description selection separately used three runs per query and achieved 60/60.
