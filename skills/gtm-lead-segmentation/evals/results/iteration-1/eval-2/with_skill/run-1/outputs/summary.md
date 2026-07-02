# gtm-lead-segmentation eval: markdown-table lead segmentation

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 4/4

## Execution

## Bulk run summary

Records processed: 2
Persona distribution:
- risk-trust-safety-lead: 1
- no-match: 1
Low-confidence records: 0
Records with open questions: 0
Records needing human review: 0

Top evidence patterns:
- Compliance, risk, trust, or operations ownership
- Onboarding, review queue, audit, and verification workflow ownership
- Clear disqualifiers for marketing or engineering roles outside the buying committee

Common open questions:
- None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The markdown table parser extracts 2 lead records. - Parsed 2 records from markdown table.
- PASS: Priya Nair is assigned risk-trust-safety-lead and Sam Ortiz is assigned no-match. - Labels: Priya Nair=risk-trust-safety-lead, Sam Ortiz=no-match.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains the disqualifier and does not invent a new persona label. - No-match output explains the disqualifier and does not invent labels.
