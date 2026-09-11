<p align="center"><img src="https://img.shields.io/badge/GTM%20Skills-Open%20source%20skills%20for%20GTM-2ea44f?style=flat-square&labelColor=24292f" alt="GTM Skills: open source skills for GTM" /></p>

<h3 align="center">Describe the GTM job. Approve once. Get a tested workflow.</h3>

<p align="center">GTM Skills gives keyboard and Slack agents the same plain-language workflow for organization context, ICPs, personas, and reusable GTM automation.</p>

<p align="center"><img src="assets/gtm-skills-flow.svg" width="88%" alt="A request becomes one approval card, a tested workflow, and links to its diagram, runs, and data" /></p>

Ask for a repeatable job. The agent drafts and verifies it silently, then shows one card stating what it reads, saves, costs, and tests. Approve once to save, deploy when hosted, and run one row. You receive `Built and tested. Ready to run whenever you want.` with a picture and links.

## Guarantees

1. Results land in a typed table with a stable key and update time.
2. Paid calls are cached, labeled, and charged against an explicit limit.
3. Dry runs make no paid calls; the approved card names the one-row test cost.
4. Every table change is committed and applied at startup locally and on Vercel.
5. Production runs only the saved revision requested by the caller.
6. The same skill text and commands drive keyboard agents and the hosted Slack agent.
7. One creation card covers build, save, hosted deployment, the one-row test, and small retries. Later real runs and chosen checkpoints each get one card.

## The five skills

| Skill | Owns |
| --- | --- |
| `gtm-workspace` | Organization structure, members, and repository health |
| `gtm-icp` | The companies an organization serves |
| `gtm-persona` | Buyers and stakeholders |
| `gtm-qualify-prospects` | Bounded, in-conversation fit checks |
| `gtm-workflow` | Workflow code, tables, runs, diagrams, and costs |

Install the skills before opening your agent, install the Claude Code permission hook when applicable, then restart:

```sh
npx skills add eliasstravik/gtm-skills -g
node ~/.agents/skills/gtm-workflow/scripts/command-permission.mjs --install-claude-code
```

Follow [Getting started](docs/getting-started.md) for prerequisites and the visible flow.

## What changed in v1

The workflow template now keeps one Vercel runtime, one typed execution path, one diagram specification, and one startup migration path. It removes the alternate durable-agent runner, event and preflight wrappers, migration-ledger workers, extra diagram renderers, and the old host-specific tool protocol. The skills now describe the same card-and-push flow on every surface.

GTM Skills is free, open source, and MIT licensed. Model, provider, Vercel, and Turso usage may cost money under the limits you choose.

Project records: [versions](VERSIONS.md) · [changelog](CHANGELOG.md) · [security](SECURITY.md) · [contributing](CONTRIBUTING.md)

<p align="center"><a href="https://github.com/eliasstravik/gtm-skills/blob/main/docs/getting-started.md"><img src="assets/buttons/install-gtm-skills.svg" alt="Install GTM Skills" /></a>&nbsp;&nbsp;<a href="https://cal.com/stravik/demo?projects=GTM%20Skills" target="_blank" rel="noopener noreferrer"><img src="assets/buttons/book-a-demo.svg" alt="Book a demo" /></a></p>
