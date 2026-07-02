# Lead Segmentation Examples

Load this reference when the user wants an example shape or when checking Northstar Compliance fixture behavior.

## One-Off Example

Input:

```text
Segment Maya Chen for Northstar Compliance's active fintech compliance outbound workspace.

Lead evidence:
- Account: HarborPay Ledger
- Title: Head of Compliance
- Department: Compliance
- Seniority: Head
- Persona signal: Owns merchant onboarding policy and audit readiness.
```

Output:

```yaml
dependency_trace:
  gtm_project: northstar-compliance
  gtm_workspace: fintech-compliance-outbound
  hard_prerequisites:
    - workspaces/fintech-compliance-outbound/personas.md found
  composed: []
  skipped:
    - gtm-lead-scoring not requested

lead_name: Maya Chen
account_name: HarborPay Ledger
persona_label: head-of-compliance
persona_name: Head of Compliance
confidence: high
needs_review: false
reasoning: >
  Maya Chen matches the Head of Compliance persona because her title and signal indicate ownership of merchant
  onboarding policy and audit readiness. Confidence is high because the title, department, seniority, and persona
  signal directly match the workspace persona definition and there are no material gaps.
evidence:
  - claim: Persona criterion match - compliance leadership and audit readiness
    source: workspaces/fintech-compliance-outbound/personas.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Lead signal - owns merchant onboarding policy and audit readiness
    source: user-provided lead evidence
    type: user-provided-context
    freshness: current
    confidence: high
open_questions:
  - None.
```

## Bulk Example

Input source: `fixtures/northstar-compliance/leads.csv`

```md
## Bulk run summary

Records processed: 8
Persona distribution:
- head-of-compliance: 2
- vp-operations: 2
- risk-trust-safety-lead: 2
- no-match: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- Compliance, risk, trust, or operations ownership
- Onboarding, review queue, audit, and verification workflow ownership
- Clear disqualifiers for marketing or engineering roles outside the buying committee

Common open questions:
- Who owns budget for compliance operations tooling?
- Is this person the current decision owner?
- Who owns compliance policy?
```

Compact output:

```csv
lead_id,account_id,account_name,lead_name,persona_label,confidence,needs_review,reasoning,top_evidence,open_questions
lead_001,acct_001,HarborPay Ledger,Maya Chen,head-of-compliance,high,false,"Title and signal directly match compliance leadership and audit readiness ownership.","Head of Compliance; merchant onboarding policy owner",""
lead_004,acct_004,BrightCart Studio,Sam Ortiz,no-match,high,false,"The lead is a growth marketing manager with no compliance, operations, risk, or trust ownership signal.","Growth marketing role at no-match account",""
lead_007,acct_007,VerityLoop Finance,Anika Shah,risk-trust-safety-lead,low,true,"The lead has a risk ownership signal, but interim status and unclear decision ownership require human review.","Risk lead signal; lending review policy","Is this person the current decision owner?"
```
