# gtm-lead-scoring eval: markdown-table lead scoring

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

## Bulk run summary

Records processed: 2
Fit distribution:
- great-fit: 1
- not-a-fit: 1
Low-confidence records: 0
Records with open questions: 0
Records needing human review: 0

Top evidence patterns:
- Compliance, operations, risk, trust, and safety ownership
- Buying influence from head, VP, director, COO, and clear owner titles
- Clear disqualifiers for non-buying or non-persona roles

Common risks or disqualifiers:
- No persona or account ICP fit

Common open questions:
- None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The markdown table parser extracts 2 lead records. - Parsed 2 records from markdown table.
- PASS: Priya Nair is scored great-fit and Jordan Reed is scored not-a-fit with score at or below 49. - Scores: Priya Nair=88/great-fit, Jordan Reed=20/not-a-fit.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains the score cap and does not invent a new persona label. - No-match output explains the cap and does not invent labels.
