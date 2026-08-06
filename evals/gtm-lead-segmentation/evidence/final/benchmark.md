# Skill Benchmark: gtm-lead-segmentation

**Model**: gpt-5.6-sol
**Date**: 2026-08-06T08:08:20Z
**Evals**: 1, 2, 3, 4, 5 (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 27% ± 11% | +0.73 |
| Time | 56.9s ± 3.8s | 53.4s ± 4.8s | +3.5s |
| Tokens | 3329 ± 954 | 3003 ± 404 | +327 |

## Notes

- The full skill passes all 34 assertions across five scenarios, while paired no-skill runs pass 9/34 (26.5%); 25 assertions discriminate in favor of the skill and none favor the baseline.
- The responsibility-over-title case passes 8/8 with-skill versus 1/8 without-skill, pinning the lead-specific rule that responsibility, authority, and cross-functional scope outrank a superficially matching title.
- Both node-local visibility directions are fully green with the skill: the Enterprise bulk run excludes root-only persona content, and the root run excludes both Enterprise-only personas.
- The obvious-node and empty-visible-set cases each pass 6/6 with-skill versus 2/6 without-skill, independently re-evidencing the shared read-only selection and missing-prerequisite behavior.
- The full skill averages 3.5 more seconds and 327 more measured output tokens per eval than the baseline while improving mean pass rate by 73.3 percentage points.
- Only one artifact run per configuration per eval was used, so within-eval variance is not measured. Description selection separately used three runs per query and achieved 60/60.
