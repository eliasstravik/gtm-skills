# Skill Benchmark: gtm-account-scoring

**Model**: gpt-5.6-sol
**Date**: 2026-08-06T08:18:51Z
**Evals**: 1, 2, 3, 4, 5 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 32% ± 16% | +0.68 |
| Time | 65.3s ± 9.3s | 54.4s ± 5.4s | +10.9s |
| Tokens | 2980 ± 601 | 2710 ± 540 | +271 |

## Notes

- The full skill passes all 36 assertions across five scenarios, while paired no-skill runs pass 12/36 (33.3%); 24 assertions discriminate in favor of the skill and none favor the baseline.
- The disqualifier case passes 8/8 with-skill versus 4/8 without-skill: the skill preserves the supplied qualified label, retains matched signals, quotes the file's words, and caps the band at weak-fit rather than inventing a terminal disqualification.
- The unknown-label root case passes 7/7 versus 1/7, proving that a suborg-qualified label is flagged and preserved at root, assigned no-fit for the scoring result, and never silently reinterpreted as the visible root ICP.
- The thin-ICP case passes 7/7 with high item confidence and no review flag while separately warning that the ICP has limited discriminatory power.
- The full skill averages 10.9 more seconds and 271 more measured output tokens per eval than the baseline while improving mean pass rate by 67.7 percentage points.
- Only one artifact run per configuration per eval was used, so within-eval variance is not measured. Description selection separately used three runs per query and achieved 60/60.
