# Examples

Use these examples to check the shape of generated context. The values are fictional and based on the Northstar Compliance demo fixture.

## Simple Sparse Setup

User interaction 1:

```text
Northstar Compliance
```

User interaction 2:

```text
Jordan Lee, SDR
```

User interaction 3:

```text
Looks good, skip links.
```

Combined confirmation before the third response should have shown:

```text
I will create a GTM Context Project:
- Organization ID: northstar-compliance
- Repo path: $GTM_HOME/northstar-compliance
- Person ID: jordan-lee
- Workspace ID: default

Files:
- .gitignore
- AGENTS.md
- CLAUDE.md
- gtm.yaml
- organization.md
- people/jordan-lee.md
- workspaces/default/context.md

Git:
- initialize local git repo
- create commit: Initialize GTM context project
- no remote push

No outreach will be sent. No CRM records will be updated.

Optional: paste links about your company, product, or you, or say skip.
```

Minimal `gtm.yaml`:

```yaml
version: 1

organization:
  id: northstar-compliance
  display_name: Northstar Compliance

default_workspace: default

business_units: {}
teams: {}

people:
  jordan-lee:
    display_name: Jordan Lee
    role: SDR
    default_workspace: default
    path: people/jordan-lee.md

workspaces:
  default:
    display_name: Default GTM Workspace
    path: workspaces/default
```

Summary:

```text
GTM context project ready

Organization
- ID: northstar-compliance
- Path: $GTM_HOME/northstar-compliance

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
```

## Source-Assisted Setup

When the user provides links in the third interaction, classify them before saving. Public Northstar-style links can be proposed as durable sources; signed, tokenized, invite, local, or unapproved private links must be omitted or converted to confirmed safe source labels.
