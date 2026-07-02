# Lead Research Examples

Load this reference when the user wants an example shape, when checking Northstar Compliance fixture behavior, or when a bulk lead research output needs a compact model.

## One-Off Example

Input:

```text
Research Maya Chen at HarborPay Ledger for Northstar Compliance's active fintech compliance outbound workspace.

Lead evidence:
- Title: Head of Compliance
- Account: HarborPay Ledger
- Persona signal: Owns merchant onboarding policy and audit readiness.
- Top evidence: Head of Compliance; merchant onboarding policy owner.
```

Output:

```yaml
dependency_trace:
  gtm_project: northstar-compliance
  gtm_workspace: fintech-compliance-outbound
  hard_prerequisites:
    - workspaces/fintech-compliance-outbound/personas.md found
  composed:
    - gtm-lead-segmentation
    - gtm-lead-scoring
    - gtm-account-research
  skipped: []

lead_name: Maya Chen
account_name: HarborPay Ledger
title: Head of Compliance
persona_label: head-of-compliance
persona_name: Head of Compliance
score: 94
fit_label: excellent-fit
research_priority: high
lead_research_brief: >
  Maya Chen is a high-priority compliance leader at HarborPay Ledger because her title and evidence
  indicate ownership of merchant onboarding policy and audit readiness at a strong-fit account.
role_relevance: >
  The role directly matches the Head of Compliance persona: policy ownership, audit readiness, and
  regulated onboarding workflow accountability.
likely_priorities:
  - Keep merchant onboarding policy consistent across review queues.
  - Prepare audit-ready evidence handoffs without scattered manual follow-up.
account_context: >
  HarborPay Ledger is a compliance-heavy fintech account with KYB review queues, compliance operations
  hiring, and audit readiness signals.
risks_disqualifiers:
  - None.
personalization_angles:
  - Lead with reducing manual KYB policy handoff work and improving audit-ready review notes.
recommended_next_step: Prioritize outreach with high-confidence compliance operations personalization.
confidence: high
needs_review: false
reasoning: >
  Maya Chen is high-priority lead research because the lead fits the Head of Compliance persona,
  the account is an excellent-fit compliance-heavy fintech, and the evidence is direct and non-conflicting.
evidence:
  - claim: Persona criterion match - Head of Compliance owns policy and audit readiness
    source: workspaces/fintech-compliance-outbound/personas.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Active SDR context and approved working preferences
    source: people/jordan-lee.md Links / sources section
    type: saved-source-link
    freshness: unknown
    confidence: medium
  - claim: Composed lead score: 94 / excellent-fit
    source: workspaces/fintech-compliance-outbound/scoring.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account context - compliance-heavy fintech with KYB and audit readiness signals
    source: composed gtm-account-research result for HarborPay Ledger
    type: newly-found-evidence
    freshness: current
    confidence: high
  - claim: Lead signal - Head of Compliance and merchant onboarding policy owner
    source: fixture lead row for Maya Chen
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
- Interim role; ownership and company maturity unclear
- Manager level; buying authority unclear
- No persona or account ICP fit

Common open questions:
- Is this person the current decision owner?
- Who owns budget for compliance operations tooling?
- Who owns compliance policy?
```

Compact output:

```csv
lead_id,account_id,account_name,lead_name,title,persona_label,score,fit_label,research_priority,confidence,needs_review,reasoning,lead_research_brief,role_relevance,likely_priorities,account_context,personalization_angles,recommended_next_step,top_evidence,open_questions
lead_001,acct_001,HarborPay Ledger,Maya Chen,Head of Compliance,head-of-compliance,94,excellent-fit,high,high,false,"Maya Chen is high-priority lead research because the lead fits Head of Compliance and the account is excellent-fit.","Maya Chen is a high-priority compliance leader at HarborPay Ledger.","Direct Head of Compliance fit and policy ownership.","Merchant onboarding policy consistency; audit-ready evidence handoffs","HarborPay Ledger is a compliance-heavy fintech with KYB and audit readiness signals.","Reduce KYB policy handoff work; improve audit-ready review notes","Prioritize outreach with high-confidence compliance operations personalization.","Head of Compliance; merchant onboarding policy owner",""
lead_004,acct_004,BrightCart Studio,Sam Ortiz,Growth Marketing Manager,no-match,27,not-a-fit,low,high,false,"Sam Ortiz is low-priority research because the role and account do not match the defined personas or ICPs.","Sam Ortiz is outside the active buying committee for this workspace.","No defined persona relevance.","None tied to Northstar's active personas","BrightCart Studio is a no-match account with no compliance operations signal.","No outbound angle recommended without a special reason to pursue.","Skip unless the user has a special reason to pursue.","Growth marketing role at no-match account",""
lead_007,acct_007,VerityLoop Finance,Anika Shah,Interim Risk Lead,risk-trust-safety-lead,76,great-fit,high,low,true,"Anika Shah is high-priority lead research but requires review because interim status and account maturity are unclear.","Anika Shah may own lending review policy, but the role is interim and needs verification.","Risk / Trust & Safety Lead fit with unclear authority.","Verify current decision ownership; clarify lending review scope","VerityLoop Finance may fit the fintech ICP, but company maturity is unclear.","Ask about manual lending review policy and current ownership before outreach.","Review manually before outreach; verify open questions.","Risk lead signal; lending review policy","Is this person the current decision owner?"
```
