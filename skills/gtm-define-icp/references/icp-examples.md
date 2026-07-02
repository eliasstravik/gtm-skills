# ICP Examples

Load this reference when drafting or updating `workspaces/<workspace-id>/icps.md`, especially when the user wants a concrete example. The values below use the fictional Northstar Compliance fixture.

## File Shape

Use this shape for a new `icps.md` unless an existing file already has a stronger human-authored structure:

```md
# ICPs

These ICP definitions are account-level segments for the `<workspace-id>` workspace.

## Segment: <Human Name>

Machine label: `<stable-kebab-label>`
confidence: high|medium|low
needs_review: true|false
reasoning: <why this segment belongs in the workspace and what uncertainty remains>

Best-fit accounts are <plain-language segment definition>.

Strong signals:

- <firmographic, technographic, trigger, workflow, or pain signal>

Disqualifiers:

- <condition that should exclude or reduce fit>

Provenance / source notes:

- workspace-context: <specific durable context or user-approved source label>

Open questions:

- <question, or "None.">
```

Always include:

```md
## No Match

Machine label: `no-match`

Use `no-match` when an account does not match any defined ICP segment. `no-match` accounts are scored as `not-a-fit` and cannot receive a score above 49.
```

## Northstar Compliance Example

Input prompt:

```text
Use gtm-define-icp to define ICPs for Northstar Compliance's fintech compliance outbound workspace. The product helps compliance, operations, and risk teams coordinate onboarding reviews, evidence collection, policy checklists, exception queues, reviewer handoffs, and audit-ready summaries.
```

Durable Context Write Preview:

```md
About to update GTM context:
- workspaces/fintech-compliance-outbound/icps.md — create ICP definitions
- Sections: Compliance-heavy fintech, Regulated B2B SaaS, Marketplace KYC / risk friction, No Match
- Preserved files: organization.md, people/jordan-lee.md, workspaces/fintech-compliance-outbound/context.md

Will create git commit:
Create ICP definitions

No outreach will be sent.
No CRM records will be updated.
No campaign triggers or remote push will happen.

Proceed?
```

Example output:

```md
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
```
