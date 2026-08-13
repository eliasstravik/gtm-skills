# Skill Benchmark: gtm-icp

**Model**: gpt-5.6-sol
**Date**: 2026-08-13T12:23:30Z
**Evals**: 1, 2, 3, 4, 5, 6, 7 (1 runs each per configuration)

## Summary

| Metric | With Skill | Baseline Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 77% ± 27% | +0.23 |
| Time | 188.9s ± 247.7s | 193.5s ± 222.5s | -4.6s |
| Tokens | 192362 ± 54568 | 193005 ± 55218 | -644 |

## Notes

- The final candidate passed all 63 assertions across create, update, delete, doctor, persona near-miss, and unavailable-save scenarios; the untouched snapshot passed 40 of 63.
- Canonical nested-path creation is discriminating: the snapshot continued to create flat files in both create scenarios, while the candidate wrote ICP.md under the slug directory.
- The candidate and snapshot both preserved the legacy flat artifact in the unavailable-save scenario, proving backward-compatible reads without migration.
- The snapshot near-miss score varied because it sometimes entered ICP workspace work before handing off; the candidate consistently handed persona work off before workspace resolution or ICP reads.
- Timing variance was dominated by service latency: candidate runs ranged from 70.0 to 749.0 seconds and snapshot runs from 66.7 to 695.8 seconds; functional grades had zero candidate variance.
