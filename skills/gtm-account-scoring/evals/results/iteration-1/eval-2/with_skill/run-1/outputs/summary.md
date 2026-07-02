# gtm-account-scoring eval: markdown-table account scoring

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
- KYB, onboarding, or business verification queues
- Regulated SaaS or compliance evidence workflows
- Clear disqualifiers for non-regulated developer/ecommerce tools

Common risks or disqualifiers:
- No buyer, workflow, or market evidence tied to compliance operations

Common open questions:
- None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The markdown table parser extracts 2 account records. - Parsed 2 records from markdown table.
- PASS: Gatewise Market is scored great-fit and CirrusKite API is scored not-a-fit with score at or below 49. - Scores: Gatewise Market=88/great-fit, CirrusKite API=29/not-a-fit.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains the score cap and does not invent a new segment label. - No-match output explains the cap and does not invent labels.
