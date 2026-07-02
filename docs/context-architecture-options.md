# Context architecture options for enterprise-ready GTM Skills

> Decision: Option 4 was accepted in [ADR 0012](adr/0012-organization-repo-with-gtm-workspaces.md).

## Research notes

Useful standardized language from existing systems and schemas:

- **Schema.org** models an `Organization` with `subOrganization`, `parentOrganization`, `department`, `employee`, `member`, and `OrganizationRole`.
- **SCIM enterprise user schema** uses `organization`, `division`, `department`, `costCenter`, and `manager` for people in an enterprise directory.
- **Microsoft Dataverse** uses `business units` as a security/modeling boundary, with users, teams, and roles associated to those units.
- **Stripe Organizations** describe centralized management across multiple accounts, business lines, subsidiaries, and account groups.

The common pattern: separate the business/legal organization from its sub-organizations/business units, then associate people, teams, roles, and operating scopes to those units.

## Requirements

The context repo must support:

1. A small company with one selling motion.
2. A large company with multiple business units, departments, product lines, regions, or GTM motions.
3. Many team members, potentially hundreds, each with their own role, focus, permissions/assignment, and preferred operating context.
4. ICPs, personas, scoring, and research prerequisites that can attach to a specific business unit or narrower GTM context, not only the whole company.
5. A git-backed local or team-shared context repo that stores durable context only.

## Option 1 — One flat repo per company

```text
~/.gtm/google/
  AGENTS.md
  CLAUDE.md
  context.md
  icps.md
  personas.md
  scoring.md
  people.md
```

### Pros

- Simplest to explain and implement.
- Works for a small company or solo seller.
- Minimal setup burden.

### Cons

- Breaks down for enterprises with multiple products, business units, markets, or teams.
- ICPs/personas/scoring become ambiguous: Google Cloud SMB and Android consumer partnerships do not share one GTM context.
- People context becomes messy in one file.
- Poor fit for team sharing and future access control.

## Option 2 — One repo per business unit or selling motion

```text
~/.gtm/google-cloud-smb/
~/.gtm/google-cloud-enterprise/
~/.gtm/android-partnerships/
```

### Pros

- Clean isolation.
- Each repo is easy for an agent to load.
- Team sharing and permissions can be handled at the repo level.

### Cons

- Duplicates parent company context across many repos.
- Hard to answer cross-business questions.
- People who work across motions need duplicated profiles or external linking.
- Hard to maintain canonical company-level facts.

## Option 3 — Company repo with business-unit folders

```text
~/.gtm/google/
  AGENTS.md
  CLAUDE.md
  organization.md
  business-units/
    google-cloud/
      context.md
      icps.md
      personas.md
      scoring.md
    android/
      context.md
      icps.md
      personas.md
      scoring.md
  people/
    jane-doe.md
    elias-stravik.md
```

### Pros

- Natural enterprise mapping: one organization, many parts.
- Avoids duplicating company-level context.
- Keeps business-unit ICPs/personas/scoring separate.
- Git sharing is straightforward.

### Cons

- Business unit may still be too coarse: Google Cloud can have SMB, enterprise, public sector, partner, and regional motions.
- People assignments to units/teams need machine-readable metadata, not just folders.
- Agents need a resolver to know which business unit to use.

## Option 4 — Company repo with scoped GTM workspaces

```text
~/.gtm/google/
  AGENTS.md
  CLAUDE.md
  gtm.yaml
  organization.md
  business-units/
    google-cloud.md
    android.md
  teams/
    cloud-smb-sdr.md
  people/
    jane-doe.md
    elias-stravik.md
  workspaces/
    google-cloud-smb-sdr/
      context.md
      icps.md
      personas.md
      scoring.md
    google-cloud-enterprise-ae/
      context.md
      icps.md
      personas.md
      scoring.md
    android-partnerships/
      context.md
      icps.md
      personas.md
      scoring.md
```

A **workspace** is the actual GTM operating scope: a combination of business unit, offering, market, segment, motion, team, and role focus.

### Pros

- Supports small companies and enterprises with the same model.
- ICPs/personas/scoring attach to the actual selling context, not only the entire company.
- People can be assigned to one or more workspaces.
- Business units remain reusable context, while workspaces own GTM execution definitions.
- Clear default: small companies get one `workspaces/default/`.

### Cons

- More concepts to explain: organization, business unit, team, person, workspace.
- Requires `gtm.yaml` or similar registry inside the project repo.
- Skills need a workspace-selection rule.

## Option 5 — Fully normalized entity graph

```text
~/.gtm/google/
  graph.json
  entities/
    organizations/
    business-units/
    offerings/
    teams/
    people/
    workspaces/
    icps/
    personas/
    scoring-models/
```

### Pros

- Most machine-readable and scalable.
- Best for future UI, APIs, syncing, permissions, and analytics.
- Avoids markdown ambiguity.

### Cons

- Too database-like for an MVP skill repo.
- Harder for humans to edit in git.
- More validation/tooling required before the skills themselves are useful.

## Recommendation

Use **Option 4: Company repo with scoped GTM workspaces**.

Adopt standardized terms:

- **Organization** — the company/client/business at the repo level.
- **Business Unit** — a division, department, product line, subsidiary, or major business area.
- **Team** — a group of people working together.
- **Person** — a team member or user of the context repo.
- **Workspace** — the active GTM operating scope where ICPs, personas, and scoring live.
- **Offering** — product/service/package being sold.
- **Market** — geography, vertical, size band, or target market.
- **GTM Motion** — outbound, inbound, PLG, enterprise sales, channel/partnerships, lifecycle, etc.

Recommended initial structure:

```text
~/.gtm/
  registry.json
  google/
    .git/
    AGENTS.md
    CLAUDE.md
    gtm.yaml
    organization.md
    business-units/
    teams/
    people/
    workspaces/
      default/
        context.md
```

`gtm-setup` can create one default workspace for small/simple companies. Larger teams can add business units, people, teams, and more workspaces later.

Skill-owned files (`icps.md`, `personas.md`, `scoring.md`) should live under the relevant workspace, not at the organization root:

```text
workspaces/google-cloud-smb-sdr/
  context.md
  icps.md
  personas.md
  scoring.md
```

This preserves the earlier rule that `gtm-setup` does not create skill-owned files, while giving those files the correct scope once the relevant skills create them.
