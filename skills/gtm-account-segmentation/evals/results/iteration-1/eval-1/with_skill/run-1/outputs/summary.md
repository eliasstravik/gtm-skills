# gtm-account-segmentation eval: CSV bulk account segmentation

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Workspace: fintech-compliance-outbound
- Pass rate: 5/5

## Execution

## Bulk run summary

Records processed: 8
Segment distribution:
- compliance-heavy-fintech: 3
- regulated-b2b-saas: 2
- marketplace-kyc-risk: 1
- no-match: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- KYB, onboarding, or business verification queues
- Regulated SaaS or compliance evidence workflows
- Clear disqualifiers for non-regulated developer/ecommerce tools

Common open questions:
- Does NorthPier buy SaaS for internal operations?
- Is there a repeatable onboarding or underwriting review queue?
- Who owns compliance operations?

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.

## Assertions

- PASS: The bulk run summary processes 8 records and includes segment counts, no-match count, low-confidence count, open-question count, and records needing review. - Bulk summary contains record, segment, no-match, low-confidence, open-question, and review counts.
- PASS: Every fixture row is assigned the expected segment label from the Northstar account fixture. - Expected labels: {'acct_001': 'compliance-heavy-fintech', 'acct_002': 'regulated-b2b-saas', 'acct_003': 'marketplace-kyc-risk', 'acct_004': 'no-match', 'acct_005': 'regulated-b2b-saas', 'acct_006': 'no-match', 'acct_007': 'compliance-heavy-fintech', 'acct_008': 'compliance-heavy-fintech'}; actual labels: {'acct_001': 'compliance-heavy-fintech', 'acct_002': 'regulated-b2b-saas', 'acct_003': 'marketplace-kyc-risk', 'acct_004': 'no-match', 'acct_005': 'regulated-b2b-saas', 'acct_006': 'no-match', 'acct_007': 'compliance-heavy-fintech', 'acct_008': 'compliance-heavy-fintech'}.
- PASS: The compact CSV output includes account_id, account_name, segment_label, confidence, needs_review, reasoning, top_evidence, and open_questions. - Compact CSV header includes every required bulk provenance field.
- PASS: VerityLoop Finance is low confidence with needs_review true, while the two no-match rows use the exact no-match label. - VerityLoop is review-gated; BrightCart Studio and CirrusKite API use no-match.
- PASS: The bulk output remains ephemeral and performs no durable write, git commit, CRM update, outreach, campaign trigger, sync, or remote push. - Ephemeral bulk run left git status clean: <clean>.
