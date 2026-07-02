# gtm-lead-research eval: markdown-table lead research

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
Persona distribution:
- risk-trust-safety-lead: 1
- no-match: 1
Fit distribution:
- great-fit: 1
- not-a-fit: 1
Low-confidence records: 0
Records with open questions: 0
Records needing human review: 0

Top signal patterns:
- Compliance, operations, risk, trust, and safety ownership
- Account-context alignment with regulated onboarding or review queues
- Clear disqualifiers for non-buying or non-persona roles

Common risks or disqualifiers:
- No persona or account ICP fit

Common open questions:
- None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The markdown table parser extracts 2 lead records. - Parsed 2 records from markdown table.
- PASS: Priya Nair is high-priority research with fit_label great-fit and Jordan Reed is low-priority research with fit_label not-a-fit. - Research priorities: Priya Nair=high/great-fit, Jordan Reed=low/not-a-fit.
- PASS: The table-mode output includes a bulk run summary and compact per-record provenance fields. - Table-mode output includes a run summary and compact per-record provenance table.
- PASS: The no-match result explains why research should not feed active outbound and does not invent a new persona label. - No-match output explains the skip and does not invent labels.
