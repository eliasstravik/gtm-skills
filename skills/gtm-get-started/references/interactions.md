# Interactions: gtm-get-started

Contents: [Nothing yet](#nothing-yet) · [Halfway](#halfway) · [Foundations done](#foundations-done)

## Nothing yet

**Setup:** No GTM workspace on this computer.

**Human:** How do I get started?

**Agent:** No GTM workspace yet, so that comes first. Name the company it is for.

**Human:** Acme

**Agent:** (gtm-workspace, Create, continues from here: where the workspace lives, then Acme's company facts.) Created the Acme workspace. Next, describe the companies to sell to.

**Agent:** (gtm-icp, Create, continues from here.)

**Files:** only those the workspace and ICP skills save

## Halfway

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and no personas.

**Human:** What do I do next?

**Agent:** Acme has a workspace and one ICP, Lean B2B SaaS. Next, describe the people to sell to, such as revenue leaders.

**Agent:** (gtm-persona, Create, continues from here; once saved, the choice in Foundations done follows.)

**Files:** only those the persona skill saves

## Foundations done

**Setup:** Workspace Acme exists with the ICP Lean B2B SaaS and the persona Revenue Leader.

**Human:** /gtm-get-started

**Agent:** Acme has a workspace, an ICP and a persona. What next?
1. Check a company or person now (Recommended)
2. Check them on a schedule
3. Use it in Slack

**Human:** 1

**Agent:** Paste a company or person to check against Lean B2B SaaS and Revenue Leader.

**Agent:** (gtm-qualify-prospects continues from here.)

**Files:** none
