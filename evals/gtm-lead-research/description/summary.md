# Description optimization summary

Model: `gpt-5.6-sol` only.

The 20-query set contains 10 realistic triggers and 10 sibling-workflow near misses, split deterministically into 12 training and 8 held-out queries.

| Candidate | One-run result |
| --- | ---: |
| General evidence-backed person research | 19/20 |
| Person-brief and outreach outcomes | 19/20 |
| Bulk and save-request outcomes | 20/20 |

The third candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user wants one or many evidence-backed person briefs, lead research, role or timing analysis, outreach preparation, or handling of a request to save lead research, using supplied sources or web access. Not for persona-label assignment, fit-band or numeric scoring, account research, persona authoring, CRM writes, person-record editing, or context setup.
