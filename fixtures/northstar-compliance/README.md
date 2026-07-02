# Northstar Compliance Fixture

This fixture is a hand-authored reference GTM Context Repository for the fictional Northstar Compliance scenario. It gives GTM Skills a shared, safe scenario for examples, scripted checks, and eval prompts before `gtm-setup` exists.

All organizations, people, domains, evidence snippets, and source labels in this fixture are fictional. The `.example` domains are placeholders and should not be treated as real source URLs.

## Scenario

- Seller organization: Northstar Compliance
- Product: AI-assisted compliance operations workspace
- User: Jordan Lee, SDR
- Workspace: Fintech compliance outbound
- GTM motion: outbound SDR prospecting

## Fixture Coverage

- Three account ICP segments:
  - `compliance-heavy-fintech`
  - `regulated-b2b-saas`
  - `marketplace-kyc-risk`
- Three lead personas:
  - `head-of-compliance`
  - `vp-operations`
  - `risk-trust-safety-lead`
- CSV rows with excellent-fit, great-fit, good-fit, weak-fit, low-confidence, and `no-match` cases.
- At least one low-confidence row with `needs_review: true` in both account and lead data.

## Files

- `gtm.yaml` indexes the organization, Jordan Lee, and the `fintech-compliance-outbound` workspace.
- `organization.md` contains organization-level context.
- `people/jordan-lee.md` contains durable person context for the SDR user.
- `workspaces/fintech-compliance-outbound/context.md` contains workspace-level GTM context.
- `workspaces/fintech-compliance-outbound/icps.md` defines account ICP segments.
- `workspaces/fintech-compliance-outbound/personas.md` defines lead personas.
- `workspaces/fintech-compliance-outbound/scoring.md` defines exemplar scoring guidance.
- `accounts.csv` and `leads.csv` provide bulk-mode test rows.
