# ADR 0078: Use a fictional Northstar Compliance demo fixture

## Status

Accepted

## Context

The MVP needs a canonical demo and verification fixture so builders can test setup, context resolution, ICP/persona definition, segmentation, scoring, research output contracts, provenance, review gates, and CSV/table bulk behavior without using private GTM data or live CRM/spreadsheet integrations.

The fixture should be realistic enough to exercise SDR/BDR workflows, but entirely fictional so it is safe to include in examples, tests, documentation, and skills.sh-facing material.

## Decision

Use a fictional but realistic B2B SaaS seller called **Northstar Compliance** as the canonical MVP demo fixture.

Canonical fixture shape:

- **Seller organization:** Northstar Compliance.
- **Product:** AI-assisted compliance operations workspace.
- **MVP user/person:** Jordan Lee, SDR.
- **Workspace:** Fintech compliance outbound.
- **GTM motion:** outbound SDR/BDR prospecting.
- **Example ICP segments:**
  - compliance-heavy fintechs;
  - regulated B2B SaaS companies;
  - marketplaces with onboarding, KYC, risk, trust, or safety friction.
- **Example personas:**
  - Head of Compliance;
  - VP Operations;
  - Risk / Trust & Safety lead.
- **Example account/lead fixture:** 6-10 fictional companies and leads in a CSV/table fixture with mixed excellent-fit, good-fit, weak-fit, low-confidence, and `no-match` cases.

The fixture should intentionally include:

1. Clear ICP matches.
2. Borderline accounts with missing or ambiguous evidence.
3. Obvious non-fits.
4. Leads that match personas and leads that do not.
5. Enough fields to test CSV/table bulk parsing.
6. Evidence snippets or source labels that can exercise provenance without pointing to real private sources.
7. At least one low-confidence row that starts with `needs_review: true`.

The canonical fixture should be used by MVP skill examples, validator tests, and build verification tasks. Builders may create the actual fixture files during implementation, but this ADR defines the fixture concept and required coverage before implementation starts.

## Consequences

- Builders have a shared, safe scenario for testing the full MVP chain.
- Examples can be realistic without relying on private customer data or live integrations.
- The fixture can exercise both one-off and CSV/table bulk modes.
- Future demos can show the value of GTM context, segmentation, scoring, provenance, and review gates with one coherent story.
