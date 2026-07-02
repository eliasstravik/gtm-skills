# Persona Examples

Load this reference when drafting or updating `workspaces/<workspace-id>/personas.md`, especially when the user wants a concrete example. The values below use the fictional Northstar Compliance fixture.

## File Shape

Use this shape for a new `personas.md` unless an existing file already has a stronger human-authored structure:

```md
# Personas

These persona definitions are lead-level segments for the `<workspace-id>` workspace.

## Persona: <Human Name>

Machine label: `<stable-kebab-label>`
confidence: high|medium|low
needs_review: true|false
reasoning: <why this persona matters inside the ICPs and what uncertainty remains>

Relevant titles:

- <title>

Department / seniority:

- <department, seniority, or reporting line signal>

Buying influence:

- <economic buyer, champion, evaluator, blocker, operator, or recommender role>

Responsibilities:

- <responsibility or workflow ownership>

Pain / priority signals:

- <pain, trigger, priority, or language this persona uses>

Common objections / disqualifiers:

- <objection, mismatch, or reason this title is not a fit>

Good outreach hooks:

- <hook>

ICP relevance:

- <which ICP segments this persona usually matters in, without copying the ICP file>

Provenance / source notes:

- workspace-context: <specific durable context or user-approved source label>
- icps: <relevant ICP labels>

Open questions:

- <question, or "None.">
```

Always include:

```md
## No Match

Machine label: `no-match`

Use `no-match` when a lead does not match any defined persona. `no-match` leads are scored as `not-a-fit` and cannot receive a score above 49.
```

## Northstar Compliance Example

Input prompt:

```text
Use gtm-define-personas to define buyer personas for Northstar Compliance's fintech compliance outbound workspace. The workspace already has ICPs for compliance-heavy fintech, regulated B2B SaaS, and marketplace KYC/risk friction.
```

Durable Context Write Preview:

```md
About to update GTM context:
- workspaces/fintech-compliance-outbound/personas.md - create persona definitions
- Sections: Head of Compliance, VP Operations, Risk / Trust & Safety Lead, No Match
- Preserved files: organization.md, people/jordan-lee.md, workspaces/fintech-compliance-outbound/context.md, workspaces/fintech-compliance-outbound/icps.md

Will create git commit:
Create persona definitions

No outreach will be sent.
No CRM records will be updated.
No campaign triggers, syncs, or remote push will happen.
No external systems will be changed.

Proceed?
```

Example output:

```md
# Personas

These persona definitions are lead-level segments for the `fintech-compliance-outbound` workspace.

## Persona: Head of Compliance

Machine label: `head-of-compliance`
confidence: high
needs_review: false
reasoning: Compliance leaders own regulated review quality, policy adherence, audit readiness, and evidence workflows across the ICPs.

Relevant titles:

- Chief Compliance Officer
- Head of Compliance
- Director of Compliance
- Compliance Operations Lead
- Compliance Program Manager

Department / seniority:

- Compliance, legal/compliance operations, or risk/compliance leadership.
- Director through executive level; senior managers can qualify when they own review operations.

Buying influence:

- Often the business owner or executive sponsor for compliance operations workflow change.
- Can approve requirements and create urgency even when operations owns daily queue execution.

Responsibilities:

- Owns compliance program execution, policy adherence, audit readiness, and regulated review workflows.
- Coordinates with legal, operations, risk, product, and customer-facing teams.
- Cares about reducing manual evidence chasing and making reviewer decisions auditable.

Pain / priority signals:

- Manual policy checklists, scattered reviewer notes, audit prep pressure, exception queues, or evidence collection gaps.
- Language about KYC, KYB, AML, vendor review, onboarding controls, SOC 2, ISO, HIPAA, PCI, GDPR, FINRA, or regulatory audits.

Common objections / disqualifiers:

- Pure legal advisory roles with no operational review ownership.
- Compliance titles at companies outside the defined ICPs or without recurring regulated workflow pressure.

Good outreach hooks:

- Review queue consistency.
- Faster audit preparation.
- Cleaner policy checklist ownership.
- Better visibility into exceptions and reviewer notes.

ICP relevance:

- Strongest for `compliance-heavy-fintech` and `regulated-b2b-saas`; relevant for `marketplace-kyc-risk` when policy enforcement is compliance-led.

Provenance / source notes:

- workspace-context: Northstar targets compliance operations, onboarding reviews, evidence management, policy checklists, exception queues, reviewer handoffs, and audit-ready summaries.
- icps: `compliance-heavy-fintech`, `regulated-b2b-saas`, `marketplace-kyc-risk`.

Open questions:

- None.

## Persona: VP Operations

Machine label: `vp-operations`
confidence: high
needs_review: false
reasoning: Operations leaders feel the day-to-day throughput, staffing, handoff, and quality problems caused by compliance work even when policy ownership sits elsewhere.

Relevant titles:

- VP Operations
- Head of Operations
- COO
- Director of Operations
- Onboarding Operations Lead

Department / seniority:

- Operations, onboarding operations, business operations, customer operations, or marketplace operations leadership.
- Director through executive level; senior managers qualify when they own repeatable queues.

Buying influence:

- Usually a champion or business owner for process change and operational metrics.
- May co-own evaluation with compliance, risk, product, or RevOps.

Responsibilities:

- Owns throughput, staffing, process quality, handoffs, and operational bottlenecks.
- Often feels the pain of compliance tasks even when compliance policy ownership sits elsewhere.
- Cares about cycle time, queue visibility, and reducing avoidable back-and-forth.

Pain / priority signals:

- Long onboarding cycle times, avoidable escalations, capacity constraints, manual handoffs, queue backlog, or management visibility gaps.

Common objections / disqualifiers:

- Operations roles focused only on facilities, finance administration, or generic internal operations with no regulated review queue.
- Junior coordinators without workflow ownership or buying influence.

Good outreach hooks:

- Shorter onboarding cycle time.
- Fewer scattered compliance handoffs.
- Better queue visibility for management.
- Clearer escalation paths.

ICP relevance:

- Relevant across all ICP segments when review throughput affects customer, merchant, vendor, or partner onboarding.

Provenance / source notes:

- workspace-context: The workspace prioritizes review cycle time, consistency, queue visibility, and audit readiness.
- icps: `compliance-heavy-fintech`, `regulated-b2b-saas`, `marketplace-kyc-risk`.

Open questions:

- Which operations titles own the fastest budget path in regulated B2B SaaS?

## Persona: Risk / Trust & Safety Lead

Machine label: `risk-trust-safety-lead`
confidence: high
needs_review: false
reasoning: Risk and Trust & Safety leaders own review queues, fraud/policy enforcement, evidence quality, and exception handling in marketplace and regulated onboarding motions.

Relevant titles:

- Head of Risk
- Director of Risk Operations
- Trust & Safety Lead
- Marketplace Risk Lead
- Fraud Operations Lead
- KYB Operations Lead

Department / seniority:

- Risk, trust and safety, fraud operations, marketplace operations, identity, or onboarding risk.
- Lead through executive level when the role owns review policy or queue outcomes.

Buying influence:

- Often a champion or evaluator with strong requirements input.
- Can become the business owner in marketplace or platform companies where risk review is core to supply quality.

Responsibilities:

- Owns risk review, trust and safety queues, merchant or provider screening, fraud review, or policy enforcement.
- Works with operations and compliance teams to balance speed, accuracy, and auditability.
- Cares about evidence quality, exception handling, and policy consistency.

Pain / priority signals:

- KYC, KYB, fraud review, identity review, provider screening, policy enforcement, dispute queues, or manual exception decisions.

Common objections / disqualifiers:

- Security engineering or threat detection roles with no operational review workflow.
- Trust/community roles focused only on moderation without onboarding, risk, evidence, or policy-review complexity.

Good outreach hooks:

- Cleaner case review workflows.
- Consistent evidence capture.
- Auditable exception decisions.
- Faster handoff between risk, operations, and compliance.

ICP relevance:

- Strongest for `marketplace-kyc-risk`; also relevant for fintech and regulated SaaS when risk operations owns onboarding review.

Provenance / source notes:

- workspace-context: The workspace names marketplaces with onboarding, KYC, KYB, trust, risk, or safety review friction.
- icps: `marketplace-kyc-risk`, `compliance-heavy-fintech`, `regulated-b2b-saas`.

Open questions:

- None.

## No Match

Machine label: `no-match`

Use `no-match` when a lead does not match any defined persona. `no-match` leads are scored as `not-a-fit` and cannot receive a score above 49.
```
