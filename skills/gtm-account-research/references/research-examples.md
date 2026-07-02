# Account Research Examples

Load this reference when the user wants an example shape, when checking Northstar Compliance fixture behavior, or when a bulk account research output needs a compact model.

## One-Off Example

Input:

```text
Research HarborPay Ledger for Northstar Compliance's active fintech compliance outbound workspace.

Account evidence:
- Website: https://harborpay-ledger.example
- Industry: Payments compliance platform
- Employee count: 420
- Summary: B2B payments company with merchant onboarding and KYB review queues.
- Signals: KYB backlog; compliance operations hiring; audit prep project.
```

Output:

```yaml
dependency_trace:
  gtm_project: northstar-compliance
  gtm_workspace: fintech-compliance-outbound
  hard_prerequisites:
    - workspaces/fintech-compliance-outbound/icps.md found
  composed:
    - gtm-account-segmentation
    - gtm-account-scoring
  skipped: []

account_name: HarborPay Ledger
website: https://harborpay-ledger.example
segment_label: compliance-heavy-fintech
score: 93
fit_label: excellent-fit
research_priority: high
research_brief: >
  HarborPay Ledger is a payments compliance platform with merchant onboarding and KYB review queues,
  making it a strong account for Northstar's compliance operations workspace.
icp_relevance: >
  The account directly matches the compliance-heavy fintech ICP because it combines payments workflows,
  KYB review operations, compliance hiring, and audit readiness.
key_signals:
  - Merchant onboarding and KYB review queues.
  - Compliance operations hiring.
  - Audit preparation work.
pain_hypotheses:
  - Manual KYB review coordination may slow merchant onboarding.
  - Audit packet preparation may require repeated evidence chasing across teams.
likely_buying_team:
  - Compliance operations
  - Risk operations
  - Operations leadership
risks_disqualifiers:
  - None.
personalization_angles:
  - Lead with reducing KYB review queue coordination work and improving audit-ready handoffs.
recommended_next_step: Prioritize outbound with account-specific compliance operations personalization.
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger is high-priority research because it directly matches the compliance-heavy fintech ICP
  and has strong KYB, compliance hiring, and audit readiness signals. Confidence is high because the account
  evidence, workspace ICP, and composed score are direct and non-conflicting.
evidence:
  - claim: Compliance-heavy fintech ICP fit
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Northstar positioning and approved messaging
    source: organization.md Website / sources section
    type: saved-source-link
    freshness: unknown
    confidence: medium
  - claim: Account signals - KYB backlog, compliance operations hiring, audit prep
    source: fixture account row for HarborPay Ledger
    type: newly-found-evidence
    freshness: current
    confidence: high
open_questions:
  - None.
```

## Bulk Example

Input source: `fixtures/northstar-compliance/accounts.csv`

```md
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
- Company size or maturity unclear
- No regulated onboarding, compliance, risk, or trust operations signal

Common open questions:
- Does NorthPier buy SaaS for internal operations?
- Is there a repeatable onboarding or underwriting review queue?
- Who owns compliance operations?
```

Compact output:

```csv
account_id,account_name,website,segment_label,score,fit_label,research_priority,confidence,needs_review,reasoning,research_brief,key_signals,pain_hypotheses,recommended_next_step,top_evidence,open_questions
acct_001,HarborPay Ledger,https://harborpay-ledger.example,compliance-heavy-fintech,93,excellent-fit,high,high,false,"Direct ICP fit with strong KYB, compliance hiring, and audit readiness signals.","Payments compliance platform with merchant onboarding and KYB review queues.","KYB review queue; compliance ops hiring; audit readiness","Manual KYB review coordination; audit evidence handoffs","Prioritize outbound with account-specific compliance operations personalization.","KYB review queue; compliance ops hiring; audit readiness",""
acct_004,BrightCart Studio,https://brightcart-studio.example,no-match,32,not-a-fit,low,high,false,"The account is outside all defined ICPs, so research should not feed active outbound unless the ICP changes.","Ecommerce design software with no regulated onboarding or compliance operations signal.","DTC design tool; no compliance operations signal","No Northstar-relevant compliance operations pain is evident.","Skip unless the user has a special reason to pursue.","DTC design tool; no compliance operations signal",""
acct_007,VerityLoop Finance,https://verityloop-finance.example,compliance-heavy-fintech,77,great-fit,high,low,true,"The account may fit the fintech ICP, but evidence is thin and maturity is unclear, so human review is required before acting.","Embedded lending startup with signs of compliance hiring but unclear product maturity.","lending workflow; compliance hiring signal","Manual underwriting or onboarding reviews may exist but need verification.","Review manually before outreach; verify repeatable underwriting or onboarding queues.","lending workflow; compliance hiring signal","Is there a repeatable onboarding or underwriting review queue?"
```
