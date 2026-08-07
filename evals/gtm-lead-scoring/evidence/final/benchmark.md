# Skill Benchmark: gtm-lead-scoring

**Model**: gpt-5.6-sol
**Date**: 2026-08-06T08:41:03Z
**Evals**: 1, 2, 3, 4, 5 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 27% ± 13% | +0.73 |
| Time | 54.3s ± 6.4s | 121.2s ± 137.9s | -66.9s |
| Tokens | 2948 ± 515 | 2657 ± 387 | +291 |

## Notes

- The corrected full skill passes all 36 assertions across five scenarios, while paired no-skill runs pass 10/36 (27.8%); 26 assertions discriminate in favor of the skill and none favor the baseline.
- The disqualifier case passes 8/8 with-skill versus 2/8 without-skill: the skill preserves the supplied qualified label, retains matched responsibilities, quotes the persona's words, and caps the band at weak-fit rather than inventing a terminal disqualification.
- The unknown-label root case passes 7/7 versus 1/7, proving that a suborg-qualified persona label is flagged and preserved at root, assigned no-fit for the scoring result, and never silently reinterpreted as the visible root persona.
- The thin-persona case passes 7/7 with high item confidence and no review flag while separately warning that the persona has limited discriminatory power.
- The empty-visible-set case proves the same missing-prerequisite stop used by the other read-only skills and never borrows the suborg-only persona.
- Only one artifact run per configuration per eval was used, so within-eval variance is not measured. Description selection separately used three runs per query and achieved 60/60.
