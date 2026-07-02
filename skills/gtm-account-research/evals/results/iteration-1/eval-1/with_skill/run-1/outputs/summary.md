# gtm-account-research eval: CSV bulk account research

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
Segment distribution:
- compliance-heavy-fintech: 3
- regulated-b2b-saas: 2
- marketplace-kyc-risk: 1
- no-match: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top signal patterns:
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

- PASS: The bulk run summary processes 8 records and includes research priority distribution, segment distribution, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, priority, segment, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected segment, score, and fit label from the Northstar account fixture. - Expected segment/score/label: {'acct_001': ('compliance-heavy-fintech', 93, 'excellent-fit'), 'acct_002': ('regulated-b2b-saas', 84, 'great-fit'), 'acct_003': ('marketplace-kyc-risk', 88, 'great-fit'), 'acct_004': ('no-match', 32, 'not-a-fit'), 'acct_005': ('regulated-b2b-saas', 58, 'good-fit'), 'acct_006': ('no-match', 29, 'not-a-fit'), 'acct_007': ('compliance-heavy-fintech', 77, 'great-fit'), 'acct_008': ('compliance-heavy-fintech', 72, 'good-fit')}; actual: {'acct_001': ('compliance-heavy-fintech', 93, 'excellent-fit'), 'acct_002': ('regulated-b2b-saas', 84, 'great-fit'), 'acct_003': ('marketplace-kyc-risk', 88, 'great-fit'), 'acct_004': ('no-match', 32, 'not-a-fit'), 'acct_005': ('regulated-b2b-saas', 58, 'good-fit'), 'acct_006': ('no-match', 29, 'not-a-fit'), 'acct_007': ('compliance-heavy-fintech', 77, 'great-fit'), 'acct_008': ('compliance-heavy-fintech', 72, 'good-fit')}.
- PASS: The compact CSV output includes account_id, account_name, website, segment_label, score, fit_label, research_priority, confidence, needs_review, reasoning, research_brief, key_signals, pain_hypotheses, recommended_next_step, top_evidence, and open_questions. - Compact CSV header includes every required research and provenance field.
- PASS: The two no-match rows use research_priority low, and VerityLoop Finance is low confidence with needs_review true. - No-match rows are low-priority; VerityLoop is review-gated.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
