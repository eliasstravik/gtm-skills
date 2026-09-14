# Get your first ICP saved and your first prospect qualified

## Prerequisites

- A coding agent that loads skills from skills.sh: Claude Code, Codex, Cursor, OpenCode, or another host.
- Node.js with `npx`, and `git`.
- Optional: the GitHub CLI (`gh`) when you want the workspace shared as a private GitHub repository.
- Optional, for saved workflows: Node.js 22 or newer locally; a Vercel account and a Turso database for hosted runs.

## Install

```sh
npx skills add eliasstravik/gtm-skills -g
```

This installs every GTM skill globally, so each host finds them. `gtm-workspace` is required; the other skills depend on it.

## Set up the workspace

In your agent, say:

```
Set up a GTM workspace for Acme
```

The agent asks whether the workspace lives on this computer only or also in a private GitHub repository named `gtm-acme`, creates `~/.gtm/acme/`, fills the organization record from what you tell it and from public sources, and commits on `main`. Add teammates the same way: "add Priya to the team", with her email.

## Produce the first result

```
Create an ICP for lean B2B SaaS companies
```

The agent drafts the ideal customer profile, shows it, and saves it under `~/.gtm/acme/icps/` when you approve. Do the same for a persona: "create a persona for revenue leaders".

Then check a prospect against them:

```
Is quillhr.com a fit?
```

The agent returns a verdict with its reasons and writes nothing.

## Inspect the result

- The workspace folder `~/.gtm/acme/` holds `ORG.md`, `members/`, `icps/`, `personas/`, and, once you build one, `workflows/`.
- `git log` in that folder shows every change as one plain-language commit.
- "Check the workspace" asks the agent to compare the folder to its contract and offer fixes.

## Next steps

- Build a saved workflow: "build a workflow that scores our inbound companies". The agent scaffolds `workflows/`, writes the workflow and its result table, opens a diagram at `http://localhost:3939/gtm/<slug>`, and states the cost before every run.
- Host it: connect a Vercel project to the workspace repository with root directory `workflows/`, add Turso and an AI Gateway key, and say "put it on a weekly schedule, hosted".
- Run it from Slack instead of a terminal: deploy [gtm-agent](https://github.com/eliasstravik/gtm-agent).

Something not working? [Open an issue](https://github.com/eliasstravik/gtm-skills/issues/new).
