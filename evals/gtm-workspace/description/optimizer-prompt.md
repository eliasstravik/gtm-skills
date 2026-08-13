You are optimizing a Codex skill frontmatter description. Return three candidate descriptions, ordered best first.

The skill is named `gtm-workspace`. It guides non-technical users through creating, importing, updating, deleting, validating, or repairing a plain Markdown GTM workspace repository at `~/.gtm/<org-slug>/`. Updating includes adding teammates or suborganizations and refreshing facts in the repo. It owns changes to the context repository itself, including its minimal contract and Git health.

It must not trigger for defining ICPs or personas, or for other work that merely reads an existing GTM workspace without changing or validating it. It also must not trigger for CRM administration, ordinary Git repositories/folders, or a non-GTM knowledge base.

Current description:

> Triggers when the user invokes `/gtm-workspace` or asks to create, import, update, delete, validate, or repair a GTM workspace repo or folder, including adding teammates or suborganizations. Not for defining ICPs or personas, or for tasks that merely use an existing context without changing or validating it.

Observed Codex/GPT trigger result across three repetitions: 58/60 correct. All 30 positive runs triggered and 28 of 30 near-miss runs did not. Both false positives were repetitions of:

> Segment the 420 accounts in accounts.csv against our existing SMB and enterprise ICPs, add a segment column, and explain ambiguous classifications. Do not change our context repo.

Codex used `gtm-workspace` in two of three repetitions because the task depended on a rubric in the repo, despite the request explicitly keeping context files unchanged.

Requirements for each candidate:

- third person and starts exactly `Triggers when`
- under 1024 characters
- observable task conditions, not implementation instructions
- preserves all positive trigger classes
- makes clear that merely reading or depending on context is insufficient
- concise exclusions for near-miss skill territory
