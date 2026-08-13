# Skill Benchmark: gtm-persona

**Model**: gpt-5.6-sol
**Date**: 2026-08-13T12:22:53Z
**Evals**: 1, 2, 3, 4, 5, 6, 7 (1 runs each per configuration)

## Summary

| Metric | With Skill | Baseline Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 84% ± 13% | +0.16 |
| Time | 158.6s ± 114.6s | 233.7s ± 251.7s | -75.0s |
| Tokens | 216827 ± 59770 | 186741 ± 38917 | +30086 |

## Notes

- The final candidate passed all 61 assertions across create, update, delete, doctor, ICP near-miss, and unavailable-save scenarios; the untouched snapshot passed 42 of 61.
- Canonical nested-path creation is discriminating: the snapshot continued to create flat files in both create scenarios, while the candidate wrote PERSONA.md under the slug directory.
- The candidate and snapshot both preserved the legacy flat artifact in the unavailable-save scenario, proving backward-compatible reads without migration.
- The candidate passed every cross-skill boundary assertion; the snapshot read persona context during one ICP handoff run.
- Timing variance was dominated by service latency, including one 404.6-second candidate deletion outlier; functional grades had zero candidate variance.
