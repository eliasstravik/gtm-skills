# gtm-account-scoring eval: CSV bulk account scoring

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
- KYB, onboarding, or business verification queues
- Regulated SaaS or compliance evidence workflows
- Clear disqualifiers for non-regulated developer/ecommerce tools

Common risks or disqualifiers:
- Company size and regulated workflow maturity are unclear
- No buyer, workflow, or market evidence tied to compliance operations
- No regulated onboarding, compliance, risk, or trust operations signal
- Service provider rather than SaaS product
- Tech stack and compliance owner not identified

Common open questions:
- Does NorthPier buy SaaS for internal operations?
- Is there a repeatable onboarding or underwriting review queue?
- Who owns compliance operations?

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The bulk run summary processes 8 records and includes fit distribution counts, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, fit distribution, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected score and fit label from the Northstar account fixture. - Expected scores/labels: {'acct_001': (93, 'excellent-fit'), 'acct_002': (84, 'great-fit'), 'acct_003': (88, 'great-fit'), 'acct_004': (32, 'not-a-fit'), 'acct_005': (58, 'good-fit'), 'acct_006': (29, 'not-a-fit'), 'acct_007': (77, 'great-fit'), 'acct_008': (72, 'good-fit')}; actual scores/labels: {'acct_001': (93, 'excellent-fit'), 'acct_002': (84, 'great-fit'), 'acct_003': (88, 'great-fit'), 'acct_004': (32, 'not-a-fit'), 'acct_005': (58, 'good-fit'), 'acct_006': (29, 'not-a-fit'), 'acct_007': (77, 'great-fit'), 'acct_008': (72, 'good-fit')}.
- PASS: The compact CSV output includes account_id, account_name, segment_label, score, fit_label, confidence, needs_review, reasoning, evidence_summary, positives, risks_disqualifiers, recommended_action, top_evidence, and open_questions. - Compact CSV header includes every required scoring and provenance field.
- PASS: The two no-match rows use fit_label not-a-fit with scores at or below 49, and VerityLoop Finance is low confidence with needs_review true. - No-match rows are capped as not-a-fit; VerityLoop is review-gated.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
