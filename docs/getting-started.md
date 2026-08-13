# Getting started — build your GTM foundation

GTM Skills gives your AI agent three focused skills that share one Git-backed source of truth. This guide takes you from installation to an organization context with its first ICP and persona, without requiring you to write code.

## 1. Check the prerequisites

You need:

- Node.js and `npx`
- Git
- An AI agent that can load installed skills

## 2. Install GTM Skills

Install all three skills globally:

```sh
npx skills add eliasstravik/gtm-skills -g
```

Your agent can now use GTM Workspace, GTM ICP, and GTM Persona.

## 3. Build your GTM workspace

Start the guided setup:

```text
/gtm-workspace
```

The skill helps you create a new organization context or import one that already exists. Review the complete preview before accepting any write. A new context is saved as a Git repository under:

```text
~/.gtm/<org-slug>/
```

Your repository can hold:

```text
<org-slug>/
├── AGENTS.md
├── CLAUDE.md
├── ORG.md
├── suborgs/
│   └── <suborg-slug>/
│       ├── ORG.md
│       ├── suborgs/<suborg-slug>/...
│       └── members/<member-slug>/MEMBER.md
└── members/
    └── <member-slug>/
        └── MEMBER.md
```

Every recursively nested suborganization has the same `ORG.md`, optional `suborgs/`, and optional `members/` shape. Organization facts, member records, ICPs, and personas stay versioned in Git so every skill uses the same accepted definitions.

## 4. Define your first ICP

Run:

```text
/gtm-icp
```

Choose the organization node that owns the market definition, describe the companies it is built to serve, and review the complete ICP preview. Once accepted, the ICP becomes part of the context repository and its history.

## 5. Define your first persona

Run:

```text
/gtm-persona
```

Choose the organization node that owns the buyer or stakeholder definition. Capture responsibilities, buying influence, authority boundaries, disqualifiers, and honest open questions, then review the complete persona before saving it.

## 6. Maintain the shared context

Use the same three skills as the organization evolves:

- Run `/gtm-workspace` to update organization facts or members, add suborganizations, migrate legacy layouts, or validate and repair the repository.
- Run `/gtm-icp` to create, refine, delete, or doctor an ICP.
- Run `/gtm-persona` to create, refine, delete, or doctor a persona.

Every accepted change is saved to Git history so it can be reviewed and recovered.

## Where to go next

- Read the [GTM Skills overview](../README.md).
- Explore the installable skills under [`skills/`](../skills/).
- Review the [MIT license](../LICENSE).
- [Open an issue](https://github.com/eliasstravik/gtm-skills/issues) if you find a problem or want to suggest an improvement.
