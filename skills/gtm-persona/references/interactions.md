# Interactions: gtm-persona

Contents: [Create](#create) · [Update](#update) · [Delete](#delete) · [Doctor](#doctor)

## Create

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and no personas.

**Human:** Create a persona for the revenue leaders at those companies.

**Agent:** Which titles count as a revenue leader?

1. VP Sales, Head of Sales, and Chief Revenue Officer (Recommended)
2. Chief Revenue Officer only
3. Those in option 1 plus Head of Revenue Operations

**Human:** 1, in the US or UK, with at least 8 years in sales.

**Agent:** Creating the persona Revenue Leader: job titles VP Sales, Head of Sales, or Chief Revenue Officer; seniority VP or C-level; sales function; US or UK; 8 or more years of experience. The other six criteria stay Unknown until supplied; Acme's company and member facts do not define prospect criteria.

Created Revenue Leader.

**Files:**
- created `personas/revenue-leader/PERSONA.md`

## Update

**Setup:** Workspace Acme exists with the persona Revenue Leader.

**Human:** Revenue Leader should speak English, and rule out anyone at an agency.

**Agent:** Setting Languages on Revenue Leader to English and adding "works at an agency" as a disqualifier.

Updated Revenue Leader.

**Human:** And add a signal: they've posted about pipeline or forecasting recently.

**Agent:** Adding a person signal to Revenue Leader: recent posts about pipeline or forecasting.

Updated Revenue Leader.

**Files:**
- changed `personas/revenue-leader/PERSONA.md`

## Delete

**Setup:** Workspace Acme exists with the personas Revenue Leader and Marketing Lead.

**Human:** Delete the CMO persona.

**Agent:** There is no persona named CMO.

1. Marketing Lead (Recommended)
2. Revenue Leader
3. Neither; show all personas

**Human:** 1

**Agent:** Delete persona Marketing Lead? This removes its saved definition. No workflow carries a copy of it.

Options: Yes; No.

**Human:** Yes.

**Agent:** Removing the persona Marketing Lead (Head of Marketing or CMO; marketing function; US or UK). No workflow carries a copy of it.

Deleted Marketing Lead. It stays in the workspace's history; request restoration when needed.

**Files:**
- deleted `personas/marketing-lead/PERSONA.md`

## Doctor

**Setup:** Workspace Acme has two personas: Revenue Leader, and one in the folder `ops-buyer` whose name line is missing.

**Human:** Check the personas.

**Agent:** One of two personas differs from the standard: the persona in the folder ops-buyer has no name line, so nothing can refer to it. Its criteria say Head of Operations or COO, operations function, 5 or more years. Revenue Leader is fine.

1. Name it Ops Buyer, to match its folder (Recommended)
2. Give it a different name
3. Leave it as it is

**Human:** 1

**Agent:** Adding the name Ops Buyer to that persona; its criteria stay as they are.

Updated Ops Buyer.

**Files:**
- changed `personas/ops-buyer/PERSONA.md`
