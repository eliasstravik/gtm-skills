# gtm-account-research eval: markdown-table account research

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

## Bulk run summary

Records processed: 2
Research priority distribution:
- high: 1
- low: 1
Segment distribution:
- marketplace-kyc-risk: 1
- no-match: 1
Low-confidence records: 0
Records with open questions: 0
Records needing human review: 0

Top signal patterns:
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
- PASS: Gatewise Market is high-priority research with fit_label great-fit and CirrusKite API is low-priority research with fit_label not-a-fit. - Research priorities: Gatewise Market=high/great-fit, CirrusKite API=low/not-a-fit.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains why research should not feed active outbound and does not invent a new segment label. - No-match output explains the skip and does not invent labels.
