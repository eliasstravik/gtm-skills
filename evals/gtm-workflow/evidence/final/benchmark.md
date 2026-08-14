# Skill Benchmark: gtm-workflow

**Model**: gpt-5.6-sol
**Date**: 2026-08-13T23:01:15Z
**Evals**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 (1 run per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|------------|---------------|-------|
| Pass Rate | 100% ± 0% | 55% ± 31% | +0.45 |
| Time | 106.6s ± 50.7s | 90.2s ± 35.5s | +16.5s |
| Tokens | 266942 ± 85700 | 198198 ± 84972 | +68743 |

## Notes

- The candidate passed all 44 assertions (100%) versus 24 of 44 (54.5%) without the skill, a 45.5 percentage-point lift across the eleven approved scenarios.
- Iteration 2 fixed the only prior candidate defect: the triggered-create transcript excludes Local before target selection and recommends Vercel Workflows immediately.
- The largest baseline gaps remain quick-local materialization, triggered infrastructure creation, node-health repair, workflow-plus-registry update with bare publish, and record-only/bound-target deletion; each baseline scored at most 2 of 4 assertions.
- Second-target setup, ungated local execution, and mutation-free single-workflow inspection passed in both configurations. They are useful regression checks but do not discriminate the skill from general model competence in this fixture set.
- The skill increased mean execution time from 90.2s to 106.6s (+16.5s, about 18%) and mean total tokens from 198,198 to 266,942 (+68,743, about 35%); the added contract and acceptance work bought the 45.5-point pass-rate gain.
- Each scenario has one run per configuration, so cross-scenario standard deviations describe workload diversity rather than repeat-run flakiness. Iteration 1 remains available as the before-fix comparison.
