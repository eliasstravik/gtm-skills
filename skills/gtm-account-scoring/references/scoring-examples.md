# Account Scoring Examples

Load this reference when the user wants an example shape, when scoring against the Northstar Compliance fixture, or when checking the missing-criteria preview branch.

## One-Off Example

Input:

```text
Score HarborPay Ledger for Northstar Compliance's active fintech compliance outbound workspace.

Account segmentation:
- segment_label: compliance-heavy-fintech
- confidence: high

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
    - workspaces/fintech-compliance-outbound/scoring.md found
  composed:
    - gtm-account-segmentation
  skipped: []

account_name: HarborPay Ledger
segment_label: compliance-heavy-fintech
score: 93
fit_label: excellent-fit
evidence_summary: HarborPay Ledger has a direct ICP fit, KYB review pain, compliance hiring, and audit readiness signals.
positives:
  - Direct compliance-heavy fintech ICP fit.
  - KYB review queue and compliance operations hiring indicate current pain.
  - Employee count is inside the workspace's plausible operating range.
risks_disqualifiers:
  - None.
recommended_action: Prioritize account research and high-confidence outbound personalization.
confidence: high
needs_review: false
reasoning: >
  HarborPay Ledger scores 93 as an excellent-fit account because it directly matches the compliance-heavy fintech ICP and shows
  current KYB, compliance operations, and audit readiness signals. Confidence is high because the segment, timing signals,
  company shape, and evidence labels are direct and non-conflicting.
evidence:
  - claim: ICP criterion match - payments company with KYB review queue
    source: workspaces/fintech-compliance-outbound/icps.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account scoring model awards ICP fit, compliance operations pain, timing, company shape, and evidence quality
    source: workspaces/fintech-compliance-outbound/scoring.md
    type: workspace-context
    freshness: current
    confidence: high
  - claim: Account signals - KYB backlog, compliance operations hiring, audit prep
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
Fit distribution:
- excellent-fit: 1
- great-fit: 3
- good-fit: 2
- not-a-fit: 2
Low-confidence records: 1
Records with open questions: 3
Records needing human review: 1

Top evidence patterns:
- KYB, onboarding, or business verification queues
- Regulated SaaS or compliance evidence workflows
- Clear disqualifiers for non-regulated developer/ecommerce tools

Common risks or disqualifiers:
- No regulated onboarding, compliance, risk, or trust operations signal
- Company size or maturity unclear

Common open questions:
- Does NorthPier buy SaaS for internal operations?
- Is there a repeatable onboarding or underwriting review queue?
- Who owns compliance operations?
```

Compact output:

```csv
account_id,account_name,segment_label,score,fit_label,confidence,needs_review,reasoning,evidence_summary,positives,risks_disqualifiers,recommended_action,top_evidence,open_questions
acct_001,HarborPay Ledger,compliance-heavy-fintech,93,excellent-fit,high,false,"Direct ICP fit with strong KYB, compliance hiring, and audit readiness signals.","Direct compliance-heavy fintech fit; KYB review pain; current timing signal","ICP fit; KYB backlog; compliance operations hiring","None.","Prioritize account research and high-confidence outbound personalization.","KYB review queue; compliance ops hiring; audit readiness",""
acct_004,BrightCart Studio,no-match,32,not-a-fit,high,false,"The account is outside all defined ICPs, so the score is capped below 50.","No matching ICP; clear non-fit evidence","Ecommerce design tooling; no compliance operations signal","No regulated onboarding, compliance, risk, or trust operations signal.","Skip unless the user has a special reason to pursue.","DTC design tool; no compliance operations signal",""
acct_007,VerityLoop Finance,compliance-heavy-fintech,77,great-fit,low,true,"The account has lending and compliance hiring signals, but evidence is thin and maturity is unclear, so human review is required.","Likely fintech fit; possible timing signal; weak evidence quality","Lending workflow; compliance hiring signal","Company size and regulated workflow maturity are unclear.","Review manually before outreach; verify repeatable underwriting or onboarding queue.","lending workflow; compliance hiring signal","Is there a repeatable onboarding or underwriting review queue?"
```

## Missing Scoring Criteria Example

Input:

```text
Score HarborPay Ledger, but the active workspace does not have workspaces/fintech-compliance-outbound/scoring.md yet.
```

Output:

```md
About to update GTM context:
- workspaces/fintech-compliance-outbound/scoring.md - create account scoring criteria
- Basis: workspace context, workspaces/fintech-compliance-outbound/icps.md, ADR 0006 fit bands
- Sections: Fit labels, Account scoring model, Required result fields

Will create git commit:
Create account scoring criteria

No account scores will be finalized until these criteria are confirmed.
No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.

Proceed?
```
