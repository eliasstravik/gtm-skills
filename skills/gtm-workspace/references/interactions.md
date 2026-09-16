# Interactions: gtm-workspace

Contents: [Create](#create) · [Create into a shared checkout](#create-into-a-shared-checkout) · [Update](#update) · [Doctor](#doctor)

## Create

**Setup:** No workspace exists for Acme. The GitHub CLI is signed in.

**Human:** Set up a GTM workspace for Acme, acme.com.

**Agent:** Creating the Acme workspace and filling its company record from supplied facts and from acme.com's own public pages; unconfirmed facts stay Unknown. One choice first: where should it live?

1. On this computer only (Recommended)
2. On this computer and in a private GitHub repository under the signed-in account, so teammates and their agents can share it

**Human:** 2

**Agent:** acme.com supplies 9 of the 13 company facts: B2B software, product analytics for SaaS teams, sold by subscription, 11–50 people, Austin, Texas. Annual revenue, Company type, Employees, and Tech stack stay Unknown until confirmed. Creating the workspace with this company record and publishing it as the private GitHub repository gtm-acme under the signed-in account.

Created the Acme workspace and published it as gtm-acme.

**Human:** We're 30 people, privately held, and we run on HubSpot and Segment. Add Priya Shah as a member: priya@acme.com, Head of Sales, Austin.

**Agent:** Setting Employees to 30, Company type to Privately held, and Tech stack to HubSpot and Segment, and adding Priya Shah as a member with that email, role, and location.

Updated Acme's company record and added Priya Shah.

**Files:**
- created `AGENTS.md`
- created `CLAUDE.md`
- created `ORG.md`
- changed `ORG.md`
- created `members/priya-shah/MEMBER.md`

## Create into a shared checkout

**Setup:** The host has already cloned the empty private repository gtm-acme into the workspace home; it has no files and no commits yet.

**Human:** Set up our GTM workspace for Acme Corp, acme.com.

**Agent:** acme.com supplies 9 of the 13 company facts: B2B software, product analytics for SaaS teams, sold by subscription, 11–50 people, Austin, Texas. Annual revenue, Company type, Employees, and Tech stack stay Unknown until confirmed. Creating the Acme Corp workspace with this company record in the shared repository already connected by the team.

Created the Acme Corp workspace.

**Files:**
- created `AGENTS.md`
- created `CLAUDE.md`
- created `ORG.md`

## Update

**Setup:** Workspaces Acme and Northwind exist. The user is not inside either.

**Human:** Add Tom Okafor to the team: tom@acme.com, Account Executive, London.

**Agent:** Which workspace?

1. Acme (Recommended)
2. Northwind

**Human:** 1

**Agent:** Adding Tom Okafor as a member of Acme with that email, role, and location.

Added Tom Okafor.

**Human:** Also, our annual revenue is about $4M now.

**Agent:** Setting Acme's Annual revenue to about $4M.

Updated Acme's Annual revenue.

**Files:**
- created `members/tom-okafor/MEMBER.md`
- changed `ORG.md`

## Doctor

**Setup:** Workspace Acme was created by an older version: a README sits at the root, the company record has no Tech stack line, and an old unit record for Acme Europe sits under `suborgs/acme-europe/`.

**Human:** Check the Acme workspace.

**Agent:** Three things differ from the current standard: the company record has no Tech stack line; a README sits at the top level, which the standard doesn't use; and Acme Europe sits in an old suborgs folder, where the standard now keeps a subsidiary as a note in the company record. Workflows are checked separately, by the workflow skill's upgrade.

1. Fix all three: add Tech stack as Unknown, remove the README, move Acme Europe's details into the company record's notes (Recommended)
2. Fix the company record only
3. Leave everything as it is

**Human:** 1

**Agent:** Apply the workspace repair? This replaces the company record, removes the README, and moves the old Acme Europe record into the company notes.

Options: Yes; No.

**Human:** Yes.

**Agent:** Adding Tech stack as Unknown, removing the README, and moving Acme Europe's details into the company record's notes; nothing else changes.

Updated Acme's company record and removed the README and the old suborgs folder.

**Files:**
- changed `ORG.md`
- deleted `README.md`
- deleted `suborgs/acme-europe/ORG.md`
