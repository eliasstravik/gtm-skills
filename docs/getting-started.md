# Getting started — run your first GTM decision

GTM Skills gives your AI agent nine focused skills that share one Git-backed source of truth. This guide takes you from installation to a segmented account without requiring you to write code.

## 1. Check the prerequisites

You need:

- Node.js and `npx`
- Git
- An AI agent that can load installed skills

## 2. Install GTM Skills

Install the complete repository of nine skills globally:

```sh
npx skills add eliasstravik/gtm-skills -g
```

Your agent can now use GTM Context, ICP and persona authoring, account and lead segmentation, account and lead scoring, and account and lead research.

## 3. Build your GTM context

Start the guided setup:

```text
/gtm-context
```

The skill helps you create a new organization context or import one that already exists. Review the complete preview before accepting any write. A new context is saved as a Git repository under:

```text
~/.gtm/<organization-slug>/
```

Your repository can hold:

```text
<organization-slug>/
├── AGENTS.md
├── CLAUDE.md
├── org.md
├── icps/
├── personas/
├── people/
└── suborgs/
```

Organization facts, ICPs, and personas stay versioned in Git so the next skill can use the same definitions.

## 4. Define your first ICP

Run:

```text
/gtm-icp
```

Choose the organization node that owns the market definition, describe the companies it is built to serve, and review the complete ICP preview. Once accepted, the ICP becomes part of the context repository and its history.

## 5. Segment an account

Run:

```text
/gtm-account-segmentation
```

Select the relevant organization node and supply the account facts you already have. The skill compares only those facts with that node’s visible ICPs and returns:

- Account
- Label
- Reasoning
- Confidence
- Needs review
- Open questions

The result stays in the response. It does not silently enrich the account or write to your CRM.

## 6. Use the result in the next decision

Continue from the same shared context:

- Run `/gtm-account-scoring` to turn the preserved segment into a qualitative fit band.
- Run `/gtm-account-research` to add current evidence, timing, and outreach angles.
- Run `/gtm-persona` to define a buyer or stakeholder.
- Run `/gtm-lead-segmentation`, `/gtm-lead-scoring`, or `/gtm-lead-research` for person-level decisions.
- Run `/gtm-context` whenever you need to inspect, update, validate, or repair the organization context.

## Where to go next

- Read the [GTM Skills overview](../README.md).
- Explore the installable skills under [`skills/`](../skills/).
- Review the [MIT license](../LICENSE).
- [Open an issue](https://github.com/eliasstravik/gtm-skills/issues) if you find a problem or want to suggest an improvement.
