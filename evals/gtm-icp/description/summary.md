# Description optimization summary

Model: `gpt-5.6-sol` only.

## Eval set

- 20 realistic queries: 10 triggers and 10 sibling-workflow near misses.
- Deterministic split: 12 training queries and 8 held-out queries.
- Near misses cover personas, account and lead segmentation, account and lead scoring, account and lead research, context-repo creation/repair, and non-durable ICP education.

## Candidates

| Candidate | One-run result | Observation |
| --- | ---: | --- |
| Concise bare-core description | 20/20 | Correct, but omitted common `define` and `refine` language |
| Expanded lifecycle and boundary description | 20/20 | Equal accuracy with broader natural triggers and explicit repo exclusions |
| Durable-outcome-only description | 19/20 | Misclassified ICP doctor work as context-repo repair |

The expanded candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user asks to create, define, refine, update, delete, or doctor an ideal customer profile file in a connected GTM context, including choosing which organization owns it. Not for personas, segmentation, scoring, account or lead research, or creating, importing, deleting, or repairing the context repository itself.
