# ICPs

These ICP definitions are account-level segments for the `fintech-compliance-outbound` workspace.

## Segment: Compliance-heavy fintech

Machine label: `compliance-heavy-fintech`
confidence: high
needs_review: false
reasoning: The workspace explicitly targets fintech companies with recurring regulated onboarding, KYC, KYB, compliance operations, and audit-readiness work.

Best-fit accounts are fintech companies that handle regulated financial workflows and have recurring compliance operations work.

Strong signals:

- Payments, banking, lending, payroll, expense, wealth, insurance, escrow, or embedded finance products.
- KYC, KYB, AML, sanctions, risk review, vendor review, or customer onboarding queues.
- Compliance operations, risk operations, onboarding operations, or audit readiness language.
- Headcount from roughly 50 to 1,500 employees.

Disqualifiers:

- Consumer-only financial content or education with no regulated workflow.
- Very early companies with no visible compliance team or regulated operations.
- Infrastructure vendors that only sell monitoring, analytics, or developer tooling with no compliance operations use case.

Provenance / source notes:

- workspace-context: Fintech compliance outbound market and constraints.
- organization-context: Northstar Compliance positioning around compliance operations, onboarding reviews, evidence management, and audit-ready summaries.

Open questions:

- None.

## Segment: Regulated B2B SaaS

Machine label: `regulated-b2b-saas`
confidence: medium
needs_review: false
reasoning: The workspace names regulated B2B SaaS as a primary market, but individual sub-verticals should still be checked for real compliance operations pressure.

Best-fit accounts are B2B SaaS companies selling into regulated customers or operating compliance-heavy workflows for their own customers.

Strong signals:

- SaaS workflows in banking, insurance, healthcare administration, HR/payroll, identity, procurement, vendor risk, or legal operations.
- Security, compliance, privacy, procurement, or customer onboarding teams that coordinate evidence and approvals.
- SOC 2, ISO, HIPAA, FINRA, PCI, GDPR, or customer audit readiness pressure.
- Operations leaders responsible for repeatable onboarding or compliance review queues.

Disqualifiers:

- Horizontal SaaS with no regulated customers, audit burden, or onboarding review workflow.
- Small internal tools with no repeatable compliance operations motion.

Provenance / source notes:

- workspace-context: Regulated B2B SaaS market definition.

Open questions:

- Which regulated SaaS sub-verticals produce the fastest sales cycles?

## Segment: Marketplace KYC / risk friction

Machine label: `marketplace-kyc-risk`
confidence: high
needs_review: false
reasoning: The workspace explicitly targets marketplaces with onboarding, KYC, KYB, trust, risk, or safety review friction.

Best-fit accounts are marketplaces or platforms where onboarding, trust, risk, or safety reviews affect supply, demand, or transaction quality.

Strong signals:

- Merchant, contractor, provider, seller, creator, driver, vendor, or partner onboarding.
- KYC, KYB, trust and safety, fraud review, identity review, policy enforcement, risk operations, or dispute queues.
- Manual evidence requests, exception handling, or audit handoffs.
- Operations or Trust & Safety leadership responsible for queue quality and review speed.

Disqualifiers:

- Marketplaces with simple listing approval and no regulated, trust, risk, or onboarding review complexity.
- Pure media, community, or content platforms with no compliance operations workflow.

Provenance / source notes:

- workspace-context: Marketplace onboarding and trust/risk review constraints.

Open questions:

- None.

## No Match

Machine label: `no-match`

Use `no-match` when an account does not match any defined ICP segment. `no-match` accounts are scored as `not-a-fit` and cannot receive a score above 49.
