# Description optimization summary

Model: `gpt-5.6-sol` only.

## Eval set

- 20 realistic queries: 10 triggers and 10 sibling-workflow near misses.
- Deterministic split: 12 training queries and 8 held-out queries.
- Near misses cover account scoring and research, ICP authoring and doctoring, lead workflows, and context-repo management.

## Candidates

| Candidate | One-run result | Observation |
| --- | ---: | --- |
| Concise segmentation description | 20/20 | Correct, but omits common route and bucket language |
| Expanded verbs and labels-in seam | 20/20 | Equal accuracy with broader natural triggers and an explicit scoring boundary |
| Observable-output description | 20/20 | Correct, but less natural for users asking for account segmentation |

The expanded candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user asks to classify, segment, route, or bucket companies against ICPs in a connected GTM context. Not for scoring already-labeled accounts, researching or enriching companies, defining ICPs, segmenting leads, or managing the context repository.
