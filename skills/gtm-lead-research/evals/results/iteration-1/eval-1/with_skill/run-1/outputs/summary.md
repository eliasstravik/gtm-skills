# gtm-lead-research eval: CSV bulk lead research

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 5/5

## Execution

## Bulk run summary

Records processed: 8
Research priority distribution:
- high: 4
- medium: 2
- low: 2
Persona distribution:
- head-of-compliance: 2
- vp-operations: 2
- risk-trust-safety-lead: 2
- no-match: 2
Fit distribution:
- excellent-fit: 1
- great-fit: 3
- good-fit: 2
- not-a-fit: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top signal patterns:
- Compliance, operations, risk, trust, and safety ownership
- Account-context alignment with regulated onboarding or review queues
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

- PASS: The bulk run summary processes 8 records and includes research priority distribution, persona distribution, fit distribution, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, priority, persona, fit, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected persona, score, and fit label from the Northstar lead fixture. - Expected persona/score/label: {'lead_001': ('head-of-compliance', 94, 'excellent-fit'), 'lead_002': ('vp-operations', 86, 'great-fit'), 'lead_003': ('risk-trust-safety-lead', 88, 'great-fit'), 'lead_004': ('no-match', 27, 'not-a-fit'), 'lead_005': ('head-of-compliance', 68, 'good-fit'), 'lead_006': ('no-match', 20, 'not-a-fit'), 'lead_007': ('risk-trust-safety-lead', 76, 'great-fit'), 'lead_008': ('vp-operations', 70, 'good-fit')}; actual: {'lead_001': ('head-of-compliance', 94, 'excellent-fit'), 'lead_002': ('vp-operations', 86, 'great-fit'), 'lead_003': ('risk-trust-safety-lead', 88, 'great-fit'), 'lead_004': ('no-match', 27, 'not-a-fit'), 'lead_005': ('head-of-compliance', 68, 'good-fit'), 'lead_006': ('no-match', 20, 'not-a-fit'), 'lead_007': ('risk-trust-safety-lead', 76, 'great-fit'), 'lead_008': ('vp-operations', 70, 'good-fit')}.
- PASS: The compact CSV output includes lead_id, account_id, account_name, lead_name, title, persona_label, score, fit_label, research_priority, confidence, needs_review, reasoning, lead_research_brief, role_relevance, likely_priorities, account_context, personalization_angles, recommended_next_step, top_evidence, and open_questions. - Compact CSV header includes every required research and provenance field.
- PASS: The two no-match rows use research_priority low, and Anika Shah is low confidence with needs_review true. - No-match rows are low-priority; Anika Shah is review-gated.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
