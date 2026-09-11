# Getting started

Ask for a reusable GTM job in plain language. Your agent drafts and checks it silently, shows one short card describing what it reads, saves, costs, and tests, then builds and runs the one-row test after you approve.

## Prerequisites

GTM Skills supports macOS and Linux.

- [Node.js](https://nodejs.org/) 22.9 through 22.x. Check with `node --version`; the workflow project rejects other major versions.
- [Git](https://git-scm.com/downloads). Check with `git --version`.
- A Git identity. Check both with `git config user.name && git config user.email`.
- GitHub authentication, using `gh auth login` or your Git credential helper. Check GitHub CLI access with `gh auth status`.
- Optional: [Vercel CLI](https://vercel.com/docs/cli) for scripted deployment. Check with `vercel --version`.

## Install before opening your agent

Run this visible setup once:

```sh
npx skills add eliasstravik/gtm-skills -g
node ~/.agents/skills/gtm-workflow/scripts/command-permission.mjs --install-claude-code
```

Restart Claude Code so its permission hook is active. Other hosts read the same command policy from the skill; their own permission prompts still apply.

## The flow you see

1. Ask `/gtm-workspace` to create or connect your shared GTM workspace.
2. Add company and buyer definitions with `/gtm-icp` and `/gtm-persona` when useful.
3. Tell `/gtm-workflow` what repeatable job you want.
4. Answer one direct question only if a result-changing fact is missing.
5. Review one card covering the saved files, hosted deployment when used, one-row test, cost, data removal, and any key you must provide.
6. Approve once. The agent reports `Saving and testing. Back in a few minutes.`
7. Receive `Built and tested. Ready to run whenever you want.` with the picture and Diagram, Runs, and Data links.

A later full run gets one approval. Each checkpoint you chose gets one approval. Small fixes to the exact approved step may retry silently twice.

## Local and hosted workflows

Local runs auto-start the workflow server and use the first supported Claude Code or Codex CLI on your path for short trusted `agent()` calls. Fully agentic `agentStage()` work uses Vercel AI Gateway so its tools, turns, and spend can be capped consistently.

For hosted setup, run `skills/gtm-workflow/scripts/setup-workflow-project.sh` from the workspace checkout. The script creates and configures the Vercel project and then tells you which dashboard-only steps remain. Vercel supplies AI Gateway authentication through project OIDC, so deployments do not require a separate Gateway key.

## Codex permission count

The required Codex acceptance session was intentionally not run because this build was instructed to skip tests and evals. Expect more than one host prompt when Codex escalates network commands from a network-off workspace sandbox; this repository does not claim a measured count until that session is run.

See the [workflow deployment reference](../skills/gtm-workflow/references/deploy.md) for the scripted and dashboard paths.
