# GTM Skills

Nine agent skills for a local go-to-market context repo built around fractal
org/suborg context.

## Install

```sh
npx skills add eliasstravik/gtmskills
```

## Context Model

A GTM context is a git repo for one company. The repo root is an org, and every
`suborgs/<id>/` child is an org with the same shape:

```text
<org>/
  org.md
  icps/
  personas/
  <skill-owned files>
  suborgs/<child-org>/
```

Root also owns `AGENTS.md`, `CLAUDE.md`, `.gitignore`, and
`people/<person-id>/person.md`. Local machine state lives outside the repo in
`~/.gtm/state.json`.

Solo shape:

```text
~/.gtm/cleanroom/
  AGENTS.md
  CLAUDE.md
  .gitignore
  org.md
  people/elias-stravik/person.md
  icps/dach-midmarket.md
  personas/revops-lead.md
```

Enterprise shape:

```text
~/.gtm/google/
  AGENTS.md
  CLAUDE.md
  .gitignore
  org.md
  people/elias-stravik/person.md
  suborgs/cloud/
    org.md
    icps/enterprise.md
    personas/revops-lead.md
    account-scoring.md
    messaging.md
    competitors.md
    suborgs/emea/
      org.md
      icps/enterprise.md
      personas/revops-lead.md
      lead-scoring.md
  suborgs/ai/org.md
  suborgs/devices/org.md
```

Labels are org-qualified: a root ICP `enterprise` is `enterprise`; a child ICP
is `cloud/emea/enterprise`.

## Skill Catalog

| Skill | Use First When |
| --- | --- |
| `gtm-setup` | Creating, registering, switching, validating, or extending a GTM context repo |
| `gtm-define-icp` | Defining or refining account-level ICP files in an org |
| `gtm-define-personas` | Defining or refining lead-level persona files in an org |
| `gtm-account-segmentation` | Classifying accounts against visible org-qualified ICP labels |
| `gtm-account-scoring` | Ranking account fit and timing after segmentation |
| `gtm-account-research` | Producing account briefs against ICP context |
| `gtm-lead-segmentation` | Classifying leads or contacts against visible org-qualified persona labels |
| `gtm-lead-scoring` | Ranking lead relevance and timing after segmentation |
| `gtm-lead-research` | Producing lead briefs against persona context |

Start with `gtm-setup`, then define ICPs and personas. Segmentation, scoring,
and research skills read inherited context from the active org path.
