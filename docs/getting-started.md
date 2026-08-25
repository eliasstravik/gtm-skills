# Getting started: build your GTM foundation

GTM Skills gives your AI agent four focused Lifecycle SOPs that share one Git-backed source of truth. This guide takes you from installation to a GTM workspace with its first ICP, persona, and reusable workflow, without requiring you to write code.

## 1. Check the prerequisites

You need:

- Node.js and `npx`
- Git
- An AI agent that can load installed skills
- Vercel CLI only if you want a workflow to run on Vercel

## 2. Install GTM Skills

Install all four skills globally:

```sh
npx skills add eliasstravik/gtm-skills -g
```

Your agent can now use GTM Workspace, GTM ICP, GTM Persona, and GTM Workflow.

## 3. Build your GTM workspace

Start the guided setup:

```text
/gtm-workspace
```

The skill helps you create a new GTM workspace or import one that already exists. Review the complete preview before accepting any write. A new workspace is saved as a Git repository under:

```text
~/.gtm/<org-slug>/
```

Your repository can hold:

```text
<org-slug>/
├── AGENTS.md
├── CLAUDE.md
├── ORG.md
├── icps/<icp-slug>/ICP.md
├── personas/<persona-slug>/PERSONA.md
├── suborgs/
│   └── <suborg-slug>/
│       ├── ORG.md
│       ├── icps/<icp-slug>/ICP.md
│       ├── personas/<persona-slug>/PERSONA.md
│       ├── suborgs/<suborg-slug>/...
│       └── members/<member-slug>/MEMBER.md
├── members/<member-slug>/MEMBER.md
└── workflows/
    ├── package.json
    ├── flows/<workflow-slug>.ts
    ├── flows/<suborg-path>/<workflow-slug>.ts
    └── data/                         # ignored run results
```

Every recursively nested suborganization has the same `ORG.md`, optional `suborgs/`, and optional `members/` shape. Organization facts, member records, ICPs, and personas stay versioned in Git so every skill uses the same accepted definitions.

## 4. Define your first ICP

Run:

```text
/gtm-icp
```

Choose the organization node that owns the market definition, describe the companies it is built to serve, and review the complete ICP preview. Once accepted, the ICP becomes part of the workspace and its history. Persona authoring and account research, segmentation, or scoring remain separate workflows.

## 5. Define your first persona

Run:

```text
/gtm-persona
```

Choose the organization node that owns the buyer or stakeholder definition. Capture responsibilities, buying influence, authority boundaries, disqualifiers, and honest open questions, then review the complete persona before saving it. ICP authoring and lead research, segmentation, or scoring remain separate workflows.

## 6. Build your first workflow

Run:

```text
/gtm-workflow
```

Choose **Create a workflow** and describe the repeatable GTM job. The skill asks where it should run, what data it accepts, which organization and ICP it uses, where results go, and the maximum rows and spend allowed.

For an on-demand workflow, start with **On this computer**. The first create silently adds the root `workflows/` project, installs its pinned dependencies, creates an ignored local environment file, builds the workflow, validates it, and runs a three-row pilot. You review one complete proposal before anything durable is saved.

Local agent work uses the first supported CLI already available on your `PATH`. You do not need Vercel or a separate model-provider key for this path.

To run the same workflow on Vercel, install and sign in to the optional CLI:

```sh
npm install --global vercel
vercel login
```

Research on Vercel uses a Vercel AI Gateway key with a spending budget. Save that key directly in the ignored `workflows/.env` file when the skill asks. Do not paste it into chat or commit it. The deployment flow checks the key before linking a project, synchronizes secrets through the shell, deploys, and verifies the production route with a three-row pilot.

## 7. Maintain the shared workspace

Use the same four skills as the organization evolves:

- Run `/gtm-workspace` to update organization facts or members, add suborganizations, or validate and repair the repository.
- Run `/gtm-icp` to create, refine, delete, or doctor an ICP.
- Run `/gtm-persona` to create, refine, delete, or doctor a persona.
- Run `/gtm-workflow` to create, update, inspect, delete, or run a saved workflow.

Every accepted change is saved to Git history so it can be reviewed and recovered.

## Where to go next

- Read the [GTM Skills overview](../README.md).
- Explore the installable skills under [`skills/`](../skills/).
- Review the [MIT license](../LICENSE).
- [Open an issue](https://github.com/eliasstravik/gtm-skills/issues) if you find a problem or want to suggest an improvement.
