# Getting started: build your GTM foundation

GTM Skills gives your AI agent five focused SOPs—four lifecycle skills and one domain skill—that share one Git-backed source of truth. This guide takes you from installation to a GTM workspace with its first ICP, persona, and reusable workflow: the agent writes the code, and you review one diff and one dry run.

## 1. Check the prerequisites

You need:

- Node.js 22 and `npx`
- Git
- An AI agent that can load installed skills
- Vercel CLI only if you want a workflow to run on Vercel

## 2. Install GTM Skills

Install all five skills globally:

```sh
npx skills add eliasstravik/gtm-skills -g
```

Your agent can now use GTM Workspace, GTM ICP, GTM Persona, GTM Qualify, and GTM Workflow.

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
    ├── workflows/<workflow-slug>.ts
    ├── workflows/<suborg-path>/<workflow-slug>.ts
    ├── db/tables/<table>.ts
    ├── providers/<provider>.ts
    ├── drizzle/                      # committed migrations
    └── data/                         # ignored local database and inputs
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

Choose the organization node that owns the buyer or stakeholder definition. Set desired or accepted criteria for full name, education, estimated followers, experience, languages, location, network size, and professional profile. Add responsibilities, buying influence, authority boundaries, disqualifiers, and honest open questions when useful, then review the complete persona before saving it. ICP authoring and lead research, segmentation, or scoring remain separate workflows.

## 6. Build your first workflow

Run:

```text
/gtm-workflow
```

Choose **Create a workflow** and describe the repeatable GTM job. The skill asks where it should run, what data it accepts, which stable key identifies a row, which organization and ICP it uses, and the maximum rows and spend allowed. It declares a typed table for the business result and commits each schema change as a migration.

For an on-demand workflow, start with **On this computer**. The first create adds the root `workflows/` project, installs its pinned dependencies, creates an ignored local environment file, builds the workflow, and validates it. You review one complete proposal before tracked files or migrations are written.

Local agent work uses the first supported CLI already available on your `PATH`. You do not need Vercel or a separate model-provider key for this path.

The agent first runs a zero-spend preview:

```sh
cd ~/.gtm/<org-slug>/workflows
npm run gtm -- run <workflow-slug> --input data/input.json --dry-run
```

After you accept the rows, stages, projected cost, and caps, the first real run pauses after three saved rows:

```sh
npm run gtm -- run <workflow-slug> --input data/input.json --checkpoint 3 --wait
npm run db:studio
```

Inspect the typed result table in Studio, then approve the rest of the same run with the exact command the agent shows. An unchanged rerun reuses cached provider and model results and records zero-cost cache hits.

To run the same workflow on Vercel, install and sign in to the optional CLI:

```sh
npm install --global vercel
vercel login
```

Research on Vercel uses a Vercel AI Gateway key with a spending budget. Save that key directly in the ignored `workflows/.env` file when the skill asks. Do not paste it into chat or commit it. The deployment flow links the project, provisions Turso through the Vercel Marketplace when needed, pulls the database pair into ignored `.env.turso`, applies the committed cloud migration, deploys, and verifies the production route with a checkpointed run.

Query cloud rows or open Studio against Turso:

```sh
npm run gtm -- query --cloud --sql "select * from <table> limit 20" --format markdown
npm run db:studio:cloud
```

## 7. Maintain the shared workspace

Use the same five skills as the organization evolves:

- Run `/gtm-workspace` to update organization facts or members, add suborganizations, or validate and repair the repository.
- Run `/gtm-icp` to create, refine, delete, or doctor an ICP.
- Run `/gtm-persona` to create, refine, delete, or doctor a persona.
- Run `/gtm-qualify` to qualify supplied people against saved personas and companies against saved ICPs in-session.
- Run `/gtm-workflow` to create, update, inspect, delete, or run a saved workflow.

Every accepted change is saved to Git history so it can be reviewed and recovered.

## Where to go next

- Read the [GTM Skills overview](../README.md).
- Explore the installable skills under [`skills/`](../skills/).
- Review the [MIT license](../LICENSE).
- [Open an issue](https://github.com/eliasstravik/gtm-skills/issues) if you find a problem or want to suggest an improvement.
