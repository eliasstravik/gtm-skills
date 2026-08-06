# Skill Benchmark: gtm-persona

**Model**: gpt-5.6-sol
**Date**: 2026-08-06T00:01:29Z
**Evals**: 1, 2, 3, 4, 5 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 39% ± 21% | +0.61 |
| Time | 90.8s ± 16.5s | 71.2s ± 14.5s | +19.7s |
| Tokens | 5351 ± 1634 | 5043 ± 1697 | +308 |

## Notes

- The full skill passes all 41 assertions across five branches, while the paired no-skill runs pass 16/41 (39.0%); 25 assertions discriminate in favor of the skill and none favor the baseline.
- Creation is the strongest separator: both create evals pass 18/18 with-skill and 4/18 without-skill. The baseline misses destination/context rules, node-local source scope, exact acceptance, factual boundaries, qualified labels, and direct interaction.
- The root update baseline passes 4/7 because the requested edit is straightforward, but it still misses the exact context, complete-preview, and interaction contracts. Delete separates more strongly at 7/7 versus 2/7 because the full skill supplies the obvious-node context, downstream consequences, exact history language, and recovery guidance.
- Doctor passes 9/9 with-skill versus 6/9 without-skill. Both can repair obvious persona files, but the full skill uniquely pins the persona-only scope, exact one-commit ritual, and saved-history close.
- The full skill averages 19.7 more seconds and 308 more tokens per eval than the baseline while improving mean pass rate by 60.6 percentage points.
- Only one run per configuration per eval was used for the artifact benchmark, so cross-eval differences are evidenced but within-eval variance is not measured. Description selection separately used three runs per query and achieved 60/60.
