# Description optimization summary

Model: `gpt-5.6-sol` only.

## Eval set

- 20 realistic queries: 10 triggers and 10 sibling-workflow near misses.
- Deterministic split: 12 training queries and 8 held-out queries.
- Near misses cover ICPs, lead segmentation and scoring, account and lead research, context-repo creation/repair, teammate records, general persona education, and copywriting avatars.

## Candidates

| Candidate | One-run result | Observation |
| --- | ---: | --- |
| Concise bare-core description | 20/20 | Correct, but omitted common `define` and `refine` language |
| Expanded lifecycle and boundary description | 20/20 | Equal accuracy with broader natural triggers and explicit sibling/repo exclusions |
| Durable-outcome-only description | 20/20 | Correct, but less natural for users asking to define a buyer persona |

The expanded candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user asks to create, define, refine, update, delete, or doctor a buyer or stakeholder persona file in a connected GTM context, including choosing which organization owns it. Not for ICPs, lead segmentation or scoring, account or lead research, teammate records, general persona advice, or creating, importing, deleting, or repairing the context repository itself.
