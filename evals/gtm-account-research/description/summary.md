# Description optimization summary

Model: `gpt-5.6-sol` only.

The 20-query set contains 10 realistic triggers and 10 sibling-workflow near misses, split deterministically into 12 training and 8 held-out queries.

| Candidate | One-run result |
| --- | ---: |
| Direct account research | 17/20 |
| Deliverable-oriented | 18/20 |
| Observable one-off outcomes | 18/20 |
| Bulk, priority, and save-request outcomes | 20/20 |

The fourth candidate was selected and retested three times per query:

- Overall: 60/60
- Training: 36/36
- Held out: 24/24
- Positive recall: 100%
- Negative specificity: 100%

## Applied description

> Triggers when a user wants one or many evidence-backed account briefs, company research, research-priority triage, fit or timing analysis, sales personalization, or handling of a request to save account research, using supplied sources or web access. Not for segment-label assignment, fit-band or numeric scoring, lead research, ICP or persona authoring, CRM writes, org-profile editing, or context setup.
