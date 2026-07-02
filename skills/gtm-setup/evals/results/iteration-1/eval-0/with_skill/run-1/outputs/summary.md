# gtm-setup eval: simple sparse setup

- GTM home: <temporary>/gtm-home
- Project: northstar-compliance
- Pass rate: 5/5

## Setup Summary

GTM context project ready

Organization
- ID: northstar-compliance
- Path: /var/folders/gf/7lzcszfj0712mkfw2ptky5vw0000gn/T/gtm-setup-sparse-eo6ejbpv/gtm-home/northstar-compliance

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
- Source-assisted enrichment: skipped
- Sources used: 0
- Unresolved questions: 0
- Links omitted/redacted for safety: 0
- Safe source labels saved: 0

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas

## Assertions

- PASS: Simple-path transcript contains at most three user prompts before the setup summary. — Found 3 user prompts before 'GTM context project ready'.
- PASS: The scaffold checker passes against the generated repo in a temp GTM_HOME. — check_scaffold returned no problems.
- PASS: registry.json matches the ADR 0003 shape and local active state is absent from the org repo. — registry.json has version/project/local active state outside the repo; no local active state keys found in project files.
- PASS: The generated .gitignore blocks local state, secrets, temporary files, logs, and ephemeral output families. — git check-ignore matched 14/14 ignored file families.
- PASS: The initial commit exists and contains only scaffold or confirmed-enrichment files. — Initial commit 6638b662 contains: .gitignore, AGENTS.md, CLAUDE.md, business-units/.gitkeep, gtm.yaml, organization.md, people/jordan-lee.md, teams/.gitkeep, workspaces/default/context.md
