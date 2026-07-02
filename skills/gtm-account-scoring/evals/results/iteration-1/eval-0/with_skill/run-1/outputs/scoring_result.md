# Account Scoring Result

Dependency trace
- GTM project: northstar-compliance
- GTM workspace: fintech-compliance-outbound
- Hard prerequisites: workspaces/fintech-compliance-outbound/icps.md found, workspaces/fintech-compliance-outbound/scoring.md found
- Composed: gtm-account-segmentation
- Skipped: none

account_name: HarborPay Ledger
segment_label: compliance-heavy-fintech
score: 93
fit_label: excellent-fit
evidence_summary: HarborPay Ledger scores 93 as excellent-fit based on KYB review queue, compliance ops hiring, audit readiness.
positives:
  - Matches Compliance-heavy fintech.
  - KYB backlog
  - compliance operations hiring
  - Fit and timing are strong enough for active prioritization.
risks_disqualifiers:
  - None.
recommended_action: Prioritize account research and high-confidence outbound personalization.
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger scores 93 as excellent-fit after segmentation into Compliance-heavy fintech based on B2B payments company with merchant onboarding and KYB review queues.. Confidence is high.
evidence:
  - claim: ICP segment used for scoring: Compliance-heavy fintech
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account scoring model applied fit, pain, timing, company shape, and evidence quality criteria
    source: workspaces/fintech-compliance-outbound/scoring.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account evidence used for scoring
    source: user-provided account evidence
    type: user-provided-context
    freshness: current
    confidence: high
open_questions:
  - None.

No durable context write, git commit, CRM update, outreach, campaign trigger, sync, or remote push happened.
