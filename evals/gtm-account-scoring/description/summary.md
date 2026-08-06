# Description optimization summary

Model: `gpt-5.6-sol` only.

## Eval set

- 20 realistic queries: 10 triggers and 10 sibling-workflow near misses.
- Deterministic split: 12 training queries and 8 held-out queries.
- Near misses cover account segmentation and research, lead workflows, ICP authoring, numeric/rubric design, and context management.

## Candidates

| Candidate | One-run result | Observation |
| --- | ---: | --- |
| Concise labels-in scoring description | 19/20 | Misread a direct qualitative-band request as label assignment |
| Expanded verbs and supplied-label seam | 19/20 | Same held-out miss because the label exclusion dominated |
| Observable fit-band description | 20/20 | Cleanly separates band assignment from segmentation and scoring-model design |

The observable fit-band candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user wants strong-fit, good-fit, weak-fit, or no-fit assigned to companies that already have ICP labels. Not for segmentation, enrichment, account research, lead workflows, scoring-model design, arithmetic, or context setup.
