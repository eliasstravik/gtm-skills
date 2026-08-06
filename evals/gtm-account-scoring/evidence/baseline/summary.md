# Preserved baseline failures

Fresh no-skill runs were executed before authoring `gtm-account-scoring` with `gpt-5.6-sol` in isolated HOME directories.

| Eval | Passed | Failed |
| --- | ---: | ---: |
| bulk-bands-and-no-match | 3 | 5 |
| suborg-disqualifier-cap | 4 | 4 |
| root-unknown-label | 2 | 5 |
| thin-icp-confidence | 3 | 4 |
| empty-visible-set | 1 | 5 |
| **Total** | **13** | **23** |

The baseline proves need across all cases. It misses canonical band vocabulary, the disqualifier cap, unknown-label handling, thin-ICP confidence separation, fixed compact fields and distributions, node-local visibility, the empty-visible-set stop, and the exact side-effect close. The preserved suborg-disqualifier grading and output are committed beside this summary.
