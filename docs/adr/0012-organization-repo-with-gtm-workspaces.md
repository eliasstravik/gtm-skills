# ADR 0012: Use organization repositories with scoped GTM workspaces

## Status

Accepted

## Context

A single flat `context.md` cannot represent enterprise GTM well. One company can have multiple business units, product lines, departments, markets, teams, and sales motions. For example, a single Organization such as Google may need separate GTM context for Google Cloud SMB outbound, Google Cloud enterprise sales, Android partnerships, and other motions.

The context repo also needs to support many People. A team-shared context repo may have hundreds of SDRs, AEs, managers, ops users, and leaders, each with role, focus, team membership, business-unit membership, and default workspace context.

ICPs, personas, segmentation, and scoring must attach to the relevant GTM operating scope, not necessarily the whole Organization.

## Decision

Use a **company/client Organization repository with scoped GTM Workspaces**. `gtm-setup` initializes the repository with git by default unless the user explicitly opts out, and creates an initial commit by default after successful scaffolding.

Default structure:

```text
~/.gtm/
  registry.json
  <organization>/
    .git/
    .gitignore
    AGENTS.md
    CLAUDE.md
    gtm.yaml
    organization.md
    business-units/
    teams/
    people/
      <person-id>.md
    workspaces/
      default/
        context.md
```

Terms:

- **Organization** — the company, client, or business represented by the repo. Root organization context lives in `organization.md`.
- **Business Unit** — a division, department, product line, subsidiary, or major business area. Business-unit context lives under `business-units/`.
- **Team** — a group of People working together. Team context lives under `teams/`.
- **Person** — a team member or context user. Person context lives under `people/`.
- **GTM Workspace** — the active operating scope for GTM work: a combination of Business Unit, Offering, Market, GTM Motion, Team, and/or Role focus. Workspace context lives under `workspaces/<workspace>/`.
- **Offering** — the product, service, package, or solution being sold within a GTM Workspace.
- **Market** — the geography, vertical, company-size band, segment, or buyer market for a GTM Workspace.
- **GTM Motion** — outbound, inbound, PLG, enterprise sales, channel/partnerships, lifecycle, customer expansion, or another commercial motion.

Skill-owned files live in the relevant workspace:

```text
workspaces/<workspace>/
  context.md
  icps.md       # created by define-icp
  personas.md  # created by define-personas
  scoring.md   # created by scoring skills when needed
```

`gtm-setup` may create `people/<person-id>.md` for the setup Person and `workspaces/default/context.md` for small/simple companies. It also creates canonical `AGENTS.md` instructions and a `CLAUDE.md` compatibility shim containing `@AGENTS.md`. It also creates project-level `.gitignore` rules that keep local state, personal overrides, ephemeral outputs, temporary files, logs, and secrets out of git. It must not create `icps.md`, `personas.md`, or `scoring.md`; those remain skill-owned files created by their owning skills. ADR 0038 defines the generated `.gitignore` template.

`gtm-setup` scaffolds `business-units/` and `teams/` directories but does not create Business Unit or Team files by default. It creates those files only when the user provides a deeper enterprise context chain that needs them.

`gtm.yaml` is the project-local machine-readable index for shared organization metadata, workspace list, default workspace, and mappings between business units, teams, people, and workspaces. Markdown files hold richer human-editable context. The root `~/.gtm/registry.json` remains the home-level local registry across many Organization repositories and stores active user state.

Workspace selection rule:

1. If the user names a workspace, use that workspace for the current task and update Local GTM State when appropriate.
2. Else use the local active workspace from `~/.gtm/registry.json`.
3. Else if the local active Person has a default workspace in `gtm.yaml`, use that.
4. Else use the shared `default_workspace` from `gtm.yaml`.
5. If there are multiple plausible workspaces and no clear default, ask the user to choose.

## Consequences

- The model supports both one-person startups and enterprise GTM teams.
- One Organization can have many GTM Workspaces without duplicating company-level context.
- ICPs, personas, segmentation, scoring, and research prerequisites can resolve against the active workspace.
- People can belong to multiple teams and workspaces.
- Skills need workspace selection rules.
- ADR 0011 is superseded for scaffold shape, but its principle remains: setup does not create skill-owned files.
