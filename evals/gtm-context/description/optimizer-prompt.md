You are optimizing a Codex skill frontmatter description. Return three candidate descriptions, ordered best first.

The skill is named `gtm-context`. It guides non-technical users through creating, importing, updating, deleting, validating, or repairing a plain Markdown GTM context repository at `~/.gtm/<org-slug>/`. Updating includes adding teammates or suborganizations and refreshing facts in the repo. It owns changes to the context repository itself, including its minimal contract and Git health.

It must not trigger for downstream work that merely reads existing GTM context: defining ICPs or personas, segmenting or scoring accounts/leads, or account/lead research. It also must not trigger for CRM administration, ordinary Git repositories/folders, or a non-GTM knowledge base.

Current description:

> Triggers when the user invokes `/gtm-context` or asks to create, import, update, delete, validate, or repair a GTM context repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, segmenting or scoring accounts, or researching accounts or leads.

Observed Codex/GPT trigger result: 19/20 correct. All ten positive requests triggered and nine of ten near-misses did not. The sole false positive was:

> Segment the 420 accounts in accounts.csv against our existing SMB and enterprise ICPs, add a segment column, and explain ambiguous classifications. Do not change our context repo.

Codex said it was using `gtm-context` because the task depended on existing ICP definitions and would inspect the repo read-only, despite the exclusion.

Requirements for each candidate:

- third person and starts exactly `Triggers when`
- under 1024 characters
- observable task conditions, not implementation instructions
- preserves all positive trigger classes
- makes clear that merely reading or depending on context is insufficient
- concise exclusions for near-miss skill territory
