# Account Segmentation Examples

Load this reference when the user wants an example shape or when checking Northstar Compliance fixture behavior.

## One-Off Example

Input:

```text
Segment HarborPay Ledger for Northstar Compliance's active fintech compliance outbound workspace.

Account evidence:
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
  composed: []
  skipped:
    - gtm-account-scoring not requested

account_name: HarborPay Ledger
segment_label: compliance-heavy-fintech
segment_name: Compliance-heavy fintech
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger matches the compliance-heavy fintech ICP because it is a payments company with KYB review queues,
  compliance operations hiring, and audit preparation work. Confidence is high because the account signals directly match
  the workspace ICP criteria and there are no material gaps.
evidence:
  - claim: ICP criterion match - payments and KYB review queue
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account signal - KYB backlog and compliance operations hiring
    source: user-provided account evidence
    type: user-provided-context
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
- Who owns compliance operations?
- Is there a repeatable onboarding or underwriting review queue?
```

Compact output:

```csv
account_id,account_name,segment_label,confidence,needs_review,reasoning,top_evidence,open_questions
acct_001,HarborPay Ledger,compliance-heavy-fintech,high,false,"Payments plus KYB and compliance operations signals directly match the ICP.","KYB review queue; compliance ops hiring; audit readiness",""
acct_004,BrightCart Studio,no-match,high,false,"The account is ecommerce design tooling with no regulated onboarding, compliance, risk, or trust operations signal.","DTC design tool; no compliance operations signal",""
acct_007,VerityLoop Finance,compliance-heavy-fintech,low,true,"The account has lending and compliance hiring signals, but company maturity and repeatable review operations are unclear, so human review is required.","lending workflow; compliance hiring signal","Is there a repeatable onboarding or underwriting review queue?"
```
