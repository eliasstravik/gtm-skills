# Account Segmentation Result

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- Hard prerequisites: workspaces/fintech-compliance-outbound/icps.md found
- Composed: none
- Skipped: gtm-account-scoring not requested

account_name: HarborPay Ledger
segment_label: compliance-heavy-fintech
segment_name: Compliance-heavy fintech
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger matches Compliance-heavy fintech based on B2B payments company with merchant onboarding and KYB review queues.. Confidence is high.
evidence:
  - claim: ICP criterion match for Compliance-heavy fintech
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account evidence used for classification
    source: user-provided account evidence
    type: user-provided-context
    freshness: current
    confidence: high
open_questions:
  - None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.
