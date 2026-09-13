# Interactions: gtm-icp

Contents: [Create](#create) · [Update](#update) · [Delete](#delete) · [Doctor](#doctor)

## Create

**Setup:** Workspace Acme exists with one ICP, Lean B2B SaaS (B2B software, 51–200 employees, US or UK, subscription revenue).

**Human:** Create an ICP for small SaaS companies in the US and UK, 20 to 100 people, selling subscriptions.

**Agent:** That overlaps with Lean B2B SaaS (B2B software, 51–200 employees, US or UK, subscription revenue).

1. Widen Lean B2B SaaS to 20–200 employees instead (Recommended)
2. Create a separate ICP named Small SaaS
3. Show me Lean B2B SaaS first

**Human:** 2

**Agent:** I'll create the ICP Small SaaS: B2B software, 20–100 employees, US or UK, subscription revenue. The other eight criteria stay Unknown until you give them; I don't borrow criteria from Acme's own company record.

Saved.

**Files:**
- created `icps/small-saas/ICP.md`

## Update

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS. The workflow Score inbound accounts carries a copy of its criteria.

**Human:** Lean B2B SaaS should require HubSpot or Salesforce, and rule out agencies and consultancies.

**Agent:** I'll set Tech stack on Lean B2B SaaS to HubSpot or Salesforce and add agencies and consultancies as disqualifiers. The workflow Score inbound accounts keeps its own copy of the earlier criteria until you ask me to update it.

Saved.

**Human:** Also accept Canada.

**Agent:** I'll add Canada to the accepted locations on Lean B2B SaaS.

Saved.

**Files:**
- changed `icps/lean-b2b-saas/ICP.md`

## Delete

**Setup:** Workspace Acme exists with the ICPs Lean B2B SaaS and Small SaaS. The workflow Score inbound accounts carries a copy of Lean B2B SaaS.

**Human:** Delete the SaaS ICP.

**Agent:** Two ICPs match.

1. Small SaaS, not copied into any workflow (Recommended)
2. Lean B2B SaaS, copied into the workflow Score inbound accounts

**Human:** 1

**Agent:** I'll remove the ICP Small SaaS (B2B software, 20–100 employees, US or UK, subscription revenue).

Deleted Small SaaS. It stays in the workspace's history; ask me to restore it if you change your mind.

**Files:**
- deleted `icps/small-saas/ICP.md`

## Doctor

**Setup:** Workspace Acme has three ICPs: Lean B2B SaaS; Enterprise, whose every criterion is Unknown; and EU Fintech, whose folder is still named `fintech-old`.

**Human:** Check the ICPs.

**Agent:** Two of three ICPs differ from the standard: Enterprise has nothing an account could be matched on, since every criterion is Unknown; EU Fintech sits in a folder named fintech-old, which doesn't match its name. Lean B2B SaaS is fine.

1. Remove Enterprise and move EU Fintech into a folder named after it (Recommended)
2. Fix the folder only and keep Enterprise
3. Leave both as they are

**Human:** 1

**Agent:** I'll remove the empty ICP Enterprise and move EU Fintech into a folder named after it. Enterprise is gone but stays in the workspace's history if you want it back.

Saved.

**Files:**
- deleted `icps/enterprise/ICP.md`
- deleted `icps/fintech-old/ICP.md`
- created `icps/eu-fintech/ICP.md`
