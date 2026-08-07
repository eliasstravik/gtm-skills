# Preserved baseline failures

Fresh no-skill runs were executed before authoring `gtm-lead-scoring` with `gpt-5.6-sol` in isolated HOME directories.

| Eval | Passed | Failed |
| --- | ---: | ---: |
| bulk-bands-and-no-match | 3 | 5 |
| suborg-disqualifier-cap | 3 | 5 |
| root-unknown-label | 1 | 6 |
| thin-persona-confidence | 3 | 4 |
| empty-visible-set | 2 | 4 |
| **Total** | **12** | **24** |

The baseline proves need across all cases. It misses canonical band vocabulary, the disqualifier cap, unknown-label handling, thin-persona confidence separation, fixed compact fields and distributions, node-local visibility, the empty-visible-set stop, lead/operator separation, and the exact side-effect close. The preserved suborg-disqualifier grading and output are committed beside this summary.
