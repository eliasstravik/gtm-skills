# gtm-setup eval: idempotency repair safety

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Pass rate: 4/4

## Setup Summary

GTM context project ready

Organization
- ID: northstar-compliance
- Path: /var/folders/gf/7lzcszfj0712mkfw2ptky5vw0000gn/T/gtm-setup-enriched-xtwztib1/gtm-home/northstar-compliance

Active local state
- Person: jordan-lee
- Workspace: default

Files
- Created: .gitignore, AGENTS.md, CLAUDE.md, gtm.yaml, organization.md, people/jordan-lee.md, workspaces/default/context.md
- Preserved: none
- Repaired: none

Git
- Initialized repo: yes
- Commit: Initialize GTM context project

Enrichment
- Source-assisted enrichment: applied
- Sources used: 5
- Unresolved questions: 0
- Links omitted/redacted for safety: 3
- Safe source labels saved: 4

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas

## Assertions

- PASS: Re-running setup on the same org is idempotent and leaves the existing repo untouched. — Immediate same-org rerun updated only registry state outside the repo; git status stayed clean.
- PASS: Repair mode preserves human-authored files and user-defined ignore rules while adding only missing scaffold rules. — Repair preserved protected files and retained the user-defined custom-cache/ ignore rule.
- PASS: The repair commit is scoped to repair-only changes. — Repair commit d2bd4ad4 changed: .gitignore
- PASS: The source-link classifier marks unsafe links as never-commit and committed files/history omit unsafe URLs. — Classified 3 unsafe links as never_commit; no unsafe URLs found in committed files/history.
