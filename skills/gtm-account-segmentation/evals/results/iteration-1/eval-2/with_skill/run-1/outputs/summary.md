# gtm-account-segmentation eval: markdown-table account segmentation

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

## Bulk run summary

Records processed: 2
Segment distribution:
- marketplace-kyc-risk: 1
- no-match: 1
Low-confidence records: 0
Records with open questions: 0
Records needing human review: 0

Top evidence patterns:
- KYB, onboarding, or business verification queues
- Regulated SaaS or compliance evidence workflows
- Clear disqualifiers for non-regulated developer/ecommerce tools

Common open questions:
- None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The markdown table parser extracts 2 account records. - Parsed 2 records from markdown table.
- PASS: Gatewise Market is assigned marketplace-kyc-risk and CirrusKite API is assigned no-match. - Labels: Gatewise Market=marketplace-kyc-risk, CirrusKite API=no-match.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains the disqualifier and does not invent a new segment label. - No-match output explains the disqualifier and does not invent labels.
