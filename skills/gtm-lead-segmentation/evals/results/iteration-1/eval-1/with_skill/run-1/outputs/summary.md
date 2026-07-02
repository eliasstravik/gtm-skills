# gtm-lead-segmentation eval: CSV bulk lead segmentation

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 5/5

## Execution

## Bulk run summary

Records processed: 8
Persona distribution:
- head-of-compliance: 2
- vp-operations: 2
- risk-trust-safety-lead: 2
- no-match: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- Compliance, risk, trust, or operations ownership
- Onboarding, review queue, audit, and verification workflow ownership
- Clear disqualifiers for marketing or engineering roles outside the buying committee

Common open questions:
- Is this person the current decision owner?
- Who owns budget for compliance operations tooling?
- Who owns compliance policy?

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The bulk run summary processes 8 records and includes persona counts, no-match count, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, persona, no-match, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected persona label from the Northstar lead fixture. - Expected labels: {'lead_001': 'head-of-compliance', 'lead_002': 'vp-operations', 'lead_003': 'risk-trust-safety-lead', 'lead_004': 'no-match', 'lead_005': 'head-of-compliance', 'lead_006': 'no-match', 'lead_007': 'risk-trust-safety-lead', 'lead_008': 'vp-operations'}; actual labels: {'lead_001': 'head-of-compliance', 'lead_002': 'vp-operations', 'lead_003': 'risk-trust-safety-lead', 'lead_004': 'no-match', 'lead_005': 'head-of-compliance', 'lead_006': 'no-match', 'lead_007': 'risk-trust-safety-lead', 'lead_008': 'vp-operations'}.
- PASS: The compact CSV output includes lead_id, account_id, account_name, lead_name, persona_label, confidence, needs_review, reasoning, top_evidence, and open_questions. - Compact CSV header includes every required bulk provenance field.
- PASS: Anika Shah is low confidence with needs_review true, while the two no-match rows use the exact no-match label. - Anika Shah is review-gated; Sam Ortiz and Jordan Reed use no-match.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
