# Lead Scoring Examples

Load this reference when the user wants an example shape, when scoring against the Northstar Compliance fixture, or when checking the missing-criteria preview branch.

## One-Off Example

Input:

```text
Score Maya Chen at HarborPay Ledger for Northstar Compliance's active fintech compliance outbound workspace.

Lead segmentation:
- persona_label: head-of-compliance
- persona_name: Head of Compliance
- confidence: high

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
    - workspaces/fintech-compliance-outbound/scoring.md found
  composed:
    - gtm-lead-segmentation
  skipped: []

lead_name: Maya Chen
account_name: HarborPay Ledger
persona_label: head-of-compliance
persona_name: Head of Compliance
score: 94
fit_label: excellent-fit
evidence_summary: Maya Chen scores 94 as excellent-fit based on Head of Compliance and merchant onboarding policy owner evidence.
positives:
  - Direct Head of Compliance persona fit.
  - Clear owner of merchant onboarding policy and audit readiness.
  - Strong enough for high-priority lead research and personalization.
risks_disqualifiers:
  - None.
recommended_action: Prioritize lead research and high-confidence outbound personalization.
confidence: high
needs_review: false
reasoning: >
  Maya Chen scores 94 as excellent-fit after segmentation into Head of Compliance based on direct title,
  compliance ownership, and merchant onboarding policy evidence. Confidence is high because the title,
  persona signal, and evidence labels are direct and non-conflicting.
evidence:
  - claim: Persona criterion match - Head of Compliance owns policy and audit readiness
    source: workspaces/fintech-compliance-outbound/personas.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Lead scoring model awards persona fit, buying influence, pain proximity, account fit alignment, and evidence quality
    source: workspaces/fintech-compliance-outbound/scoring.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Lead evidence - Head of Compliance; merchant onboarding policy owner
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
Fit distribution:
- excellent-fit: 1
- great-fit: 3
- good-fit: 2
- not-a-fit: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- Compliance, operations, risk, trust, and safety ownership
- Buying influence from head, VP, director, COO, and clear owner titles
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
lead_id,account_id,account_name,lead_name,persona_label,score,fit_label,confidence,needs_review,reasoning,evidence_summary,positives,risks_disqualifiers,recommended_action,top_evidence,open_questions
lead_001,acct_001,HarborPay Ledger,Maya Chen,head-of-compliance,94,excellent-fit,high,false,"Maya Chen scores 94 as excellent-fit after segmentation into Head of Compliance based on direct policy and audit readiness ownership. Confidence is high.","Maya Chen scores 94 as excellent-fit based on Head of Compliance; merchant onboarding policy owner.","Matches Head of Compliance.; Head of Compliance; merchant onboarding policy owner; Fit and timing are strong enough for active prioritization.","None.","Prioritize lead research and high-confidence outbound personalization.","Head of Compliance; merchant onboarding policy owner",""
lead_006,acct_006,CirrusKite API,Jordan Reed,no-match,20,not-a-fit,high,false,"Jordan Reed scores 20 as not-a-fit because gtm-lead-segmentation returned no-match; the score is capped below 50 and cannot become good-fit without updated persona definitions.","Jordan Reed has no defined persona match, so not-a-fit scoring is capped below 50.","None tied to a defined persona.","No persona or account ICP fit","Skip unless the user has a special reason to pursue.","Engineering IC at no-match account",""
lead_007,acct_007,VerityLoop Finance,Anika Shah,risk-trust-safety-lead,76,great-fit,low,true,"Anika Shah scores 76 as great-fit after segmentation into Risk / Trust & Safety Lead, but the interim role and unclear ownership require human review.","Anika Shah scores 76 as great-fit based on Risk lead signal; lending review policy.","Matches Risk / Trust & Safety Lead.; Risk lead signal; lending review policy; Fit and timing are strong enough for active prioritization.","Interim role; ownership and company maturity unclear","Review manually before outreach; verify the open questions that affect the score.","Risk lead signal; lending review policy","Is this person the current decision owner?"
```

## Missing Scoring Criteria Example

Input:

```text
Score Maya Chen, but the active workspace does not have workspaces/fintech-compliance-outbound/scoring.md yet.
```

Output:

```md
About to update GTM context:
- workspaces/fintech-compliance-outbound/scoring.md - create lead scoring criteria
- Basis: workspace context, workspaces/fintech-compliance-outbound/personas.md, ADR 0006 fit bands
- Sections: Fit labels, Lead scoring model, Required result fields

Will create git commit:
Create lead scoring criteria

No lead scores will be finalized until these criteria are confirmed.
No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.

Proceed?
```
