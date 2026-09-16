# Interactions: gtm-qualify-prospects

Contents: [One person](#one-person) · [One company](#one-company) · [A mixed batch](#a-mixed-batch) · [A paid-lookup gate](#a-paid-lookup-gate)

## One person

**Setup:** Workspace Acme exists with the persona Revenue Leader (VP Sales, Head of Sales, or Chief Revenue Officer; sales function; US or UK; 8 or more years; English; disqualifier: works at an agency). No paid data tools are available to the agent.

**Human:** Is this a fit? Dana Ruiz, VP Sales at Brightpath (SaaS, about 120 people, Austin), 11 years in sales, previously an account executive at a large CRM vendor.

**Agent:** Verdict: Excellent
Score: 88
Confidence: Medium
Scored against: Revenue Leader
Reasoning: Title, seniority, function, location, and years all match, and nothing points to an agency. Languages and headline are unstated, which lowers confidence, not the band.

**Human:** What would make it High confidence?

**Agent:** A source that states her language and headline, such as her public profile; that would confirm the two unstated criteria without changing the verdict. Nothing was saved; fit checks stay in the conversation.

**Files:** none

## One company

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS (B2B software; 20–200 employees; US, UK, or Canada; subscription revenue; HubSpot or Salesforce; disqualifiers: agencies and consultancies). No paid data tools are available to the agent.

**Human:** Check quillhr.com against our ICP.

**Agent:** Verdict: Good
Score: 76
Confidence: Medium
Scored against: Lean B2B SaaS
Reasoning: Quill HR's site describes subscription HR software for mid-size companies, a London headquarters, and a team of about 230, which matches business type, industry, revenue, and location; the headcount sits just above the 200 ceiling, which keeps it out of Excellent. Its CRM isn't stated, which lowers confidence, not the band.

**Human:** And tandem.agency?

**Agent:** Verdict: Not a fit
Score: 0
Confidence: High
Scored against: Lean B2B SaaS
Reasoning: Tandem describes itself as a marketing agency, which matches the disqualifier "agencies and consultancies"; a matched disqualifier sets the score to 0 whatever else matches.

**Files:** none

## A mixed batch

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and the persona Revenue Leader, as above. No paid data tools are available to the agent.

**Human:** Score these: Dana Ruiz, VP Sales at Brightpath, 11 years in sales, Austin. Marcus Lee, Marketing Coordinator at Tandem Agency, 2 years, London. Brightpath (brightpath.io). Quill HR (quillhr.com).

**Agent:** People, scored against Revenue Leader:

| Person | Verdict | Score | Confidence |
| --- | --- | --- | --- |
| Dana Ruiz | Excellent | 88 | Medium |
| Marcus Lee | Not a fit | 0 | High |

Companies, scored against Lean B2B SaaS:

| Company | Verdict | Score | Confidence |
| --- | --- | --- | --- |
| Brightpath | Excellent | 90 | Medium |
| Quill HR | Good | 76 | Medium |

Dana Ruiz: title, seniority, function, location, and years match; languages and headline unstated.
Marcus Lee: works at an agency, which is a disqualifier; a coordinator with 2 years would also miss seniority and experience.
Brightpath: subscription B2B analytics software, Austin, about 120 people, all within the ICP; CRM unstated.
Quill HR: matches on business type, industry, revenue, and location; about 230 people sits just above the ceiling; CRM unstated.
Fit only; recurring scoring belongs in a gtm-workflow.

**Human:** Save these somewhere.

**Agent:** Fit checks don't save anything. For repeated scoring, request a workflow that scores inbound companies against Lean B2B SaaS and keeps a sortable, shareable table.

**Files:** none

## A paid-lookup gate

**Setup:** As above, and the agent has a Crustdata company-lookup tool whose published price, in this example, is $0.02 per company.

**Human:** Score brightpath.io, quillhr.com, and northfield.co against our ICP.

**Agent:** Only three web addresses are available. Brightpath's and Quill HR's public sites cover most criteria; Northfield's says almost nothing.

1. Look up all three with Crustdata: 3 calls at $0.02 each, $0.06 in total, filling size, industry, location, and tech stack (Recommended)
2. Score from the public sites only, free, with lower confidence

**Human:** 1

**Agent:** Companies, scored against Lean B2B SaaS:

| Company | Verdict | Score | Confidence |
| --- | --- | --- | --- |
| Brightpath | Excellent | 92 | High |
| Quill HR | Good | 78 | High |
| Northfield | Fair | 55 | High |

Brightpath: every criterion confirmed, including HubSpot.
Quill HR: matches on all but headcount, 230 against a 200 ceiling; uses Salesforce.
Northfield: B2B software in Canada on subscriptions, but 12 people is below the floor and its CRM is neither HubSpot nor Salesforce.
Fit only; recurring scoring belongs in a gtm-workflow.

**Files:** none
