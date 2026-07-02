# Account Research Result

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- Hard prerequisites: workspaces/fintech-compliance-outbound/icps.md found
- Composed: gtm-account-segmentation, gtm-account-scoring
- Skipped: none

account_name: HarborPay Ledger
website: https://harborpay-ledger.example
segment_label: compliance-heavy-fintech
score: 93
fit_label: excellent-fit
research_priority: high
research_brief: >
  HarborPay Ledger is a Payments compliance platform with b2b payments company with merchant onboarding and kyb review queues.
icp_relevance: >
  HarborPay Ledger matches the Compliance-heavy fintech ICP because of KYB backlog; compliance operations hiring; audit prep project.
key_signals:
  - KYB backlog
  - compliance operations hiring
  - audit prep project
pain_hypotheses:
  - Manual KYC, KYB, or regulated onboarding review coordination may slow growth.
  - Audit-ready evidence handoffs may be scattered across teams.
likely_buying_team:
  - Compliance operations
  - Risk operations
  - Operations leadership
risks_disqualifiers:
  - None.
personalization_angles:
  - Lead with review queue coordination, evidence handoffs, and audit readiness.
recommended_next_step: Prioritize outbound with account-specific compliance operations personalization.
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger is high-priority account research after segmentation into Compliance-heavy fintech and composed scoring at 93/excellent-fit based on B2B payments company with merchant onboarding and KYB review queues.. Confidence is high.
evidence:
  - claim: ICP segment used for account research: Compliance-heavy fintech
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Northstar positioning, proof, constraints, and saved source labels
    source: organization.md Website / sources section
    type: saved-source-link
    freshness: unknown
    confidence: medium
  - claim: Account evidence used for research brief
    source: https://harborpay-ledger.example
    type: newly-found-evidence
    freshness: current
    confidence: high
  - claim: Composed account score: 93 / excellent-fit
    source: workspaces/fintech-compliance-outbound/scoring.md
    type: workspace-context
    freshness: current
    confidence: high
open_questions:
  - None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.
