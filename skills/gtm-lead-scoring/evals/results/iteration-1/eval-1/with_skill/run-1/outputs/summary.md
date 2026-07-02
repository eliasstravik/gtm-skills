# gtm-lead-scoring eval: CSV bulk lead scoring

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 5/5

## Execution

## Bulk run summary

Records processed: 8
Fit distribution:
- excellent-fit: 1
- great-fit: 3
- good-fit: 2
- not-a-fit: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- Compliance, operations, risk, trust, and safety ownership
- Buying influence from head, VP, director, COO, and clear owner titles
- Clear disqualifiers for non-buying or non-persona roles

Common risks or disqualifiers:
- Compliance owner may be separate
- Interim role
- Manager level
- No compliance, operations, risk, or trust ownership
- No persona or account ICP fit

Common open questions:
- Is this person the current decision owner?
- Who owns budget for compliance operations tooling?
- Who owns compliance policy?

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The bulk run summary processes 8 records and includes fit distribution counts, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, fit distribution, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected score and fit label from the Northstar lead fixture. - Expected scores/labels: {'lead_001': (94, 'excellent-fit'), 'lead_002': (86, 'great-fit'), 'lead_003': (88, 'great-fit'), 'lead_004': (27, 'not-a-fit'), 'lead_005': (68, 'good-fit'), 'lead_006': (20, 'not-a-fit'), 'lead_007': (76, 'great-fit'), 'lead_008': (70, 'good-fit')}; actual scores/labels: {'lead_001': (94, 'excellent-fit'), 'lead_002': (86, 'great-fit'), 'lead_003': (88, 'great-fit'), 'lead_004': (27, 'not-a-fit'), 'lead_005': (68, 'good-fit'), 'lead_006': (20, 'not-a-fit'), 'lead_007': (76, 'great-fit'), 'lead_008': (70, 'good-fit')}.
- PASS: The compact CSV output includes lead_id, account_id, account_name, lead_name, persona_label, score, fit_label, confidence, needs_review, reasoning, evidence_summary, positives, risks_disqualifiers, recommended_action, top_evidence, and open_questions. - Compact CSV header includes every required scoring and provenance field.
- PASS: The two no-match rows use fit_label not-a-fit with scores at or below 49, and Anika Shah is low confidence with needs_review true. - No-match rows are capped as not-a-fit; Anika Shah is review-gated.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
