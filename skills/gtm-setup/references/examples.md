# Examples

Use these examples to check the shape of generated context. The values are fictional and based on the Northstar Compliance demo fixture.

## Import Gate

When no GTM Context Project resolves, start with a compact choice:

```text
How should I set up GTM context?

1. Start fresh
2. Import an existing GTM context repo
3. Switch to an existing registered project
```

Only show option 3 when `$GTM_HOME/registry.json` already has projects.

## Fresh Setup With Research Blocks

User chooses:

```text
1
```

Company block prompt:

```text
Company name and website?
```

User response:

```text
Northstar Compliance
https://northstar.example
```

Before researching, say:

```text
this takes a couple of minutes - I'm researching so you don't have to type it.
```

Company confirmation should be compact and targeted:

```text
organization.md summary
- What this organization is: Northstar Compliance helps compliance teams monitor policy exceptions.
- Products / offerings: exception monitoring dashboard and compliance workflow reporting.
- Proof points: public customer stories on the official site.
- Sources: https://northstar.example, https://northstar.example/customers

Questions
1. The site names both regulated finance and healthcare. Which market should I seed in workspace context?
2. Leave market blank for now.
```

Person block prompt:

```text
Your name, job title, and any professional/social profile links?
```

User response:

```text
Jordan Lee
SDR
https://www.linkedin.com/in/jordan-lee-example
```

Before researching, repeat:

```text
this takes a couple of minutes - I'm researching so you don't have to type it.
```

Person confirmation should state commit visibility:

```text
people/jordan-lee.md summary
- Role: SDR
- Public profile/source links: LinkedIn profile supplied by user

Confirmed person facts will be committed to the Organization repo, which may be shared later.

Options
1. Commit these person facts
2. Remove the profile link before writing
3. Keep person context sparse
```

Combined write preview:

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

No outreach will be sent. No CRM records will be updated. No campaign action will happen.
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
- Source-assisted enrichment: applied
- Sources used: 3
- Unresolved questions: 0
- Links omitted/redacted for safety: 0
- Safe source labels saved: 0

Import / sharing
- Imported project: no
- Trust gate: not applicable
- Structure gate: not applicable
- Published/shared: not requested

Next recommended skills
1. gtm-define-icp
2. gtm-define-personas
```

## Import Example

User chooses import and provides:

```text
https://github.com/example/northstar-gtm-context
```

Expected behavior:

1. Clone under `$GTM_HOME/northstar-gtm-context`, using a numeric suffix if needed.
2. Compare imported `AGENTS.md` and `CLAUDE.md` against the packaged templates.
3. Parse `gtm.yaml` and require `organization.id` and `organization.display_name`.
4. Register and activate only after the trust and structure gates pass or the user explicitly approves divergent instruction text.

If `gtm.yaml` is absent or broken:

```text
This is not a GTM Context Project because I could not parse gtm.yaml with organization id/name.

Options
1. Start fresh using this repo's contents as source material
2. Cancel import
```
