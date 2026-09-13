---
name: gtm-workflow
description: Triggers when a user asks to build, create, update, run, test, schedule, deploy, host, upgrade, inspect, or delete a saved GTM workflow, its result table, runs, or diagram in a GTM workspace, with phrasings like "build a workflow that scores our inbound companies", "run Score inbound accounts", "put it on a weekly schedule, hosted", or "upgrade the workflow runtime". Owns the workflows folder, which holds workflow code, tables, runs, schedules, diagrams, and Vercel deploys. Not for the workspace, ICPs, or personas themselves (gtm-workspace, gtm-icp, gtm-persona), or one-off fit checks that are not saved (gtm-qualify-prospects).
---

# GTM Workflow

## Trigger

Apply this skill when a request concerns a saved workflow: creating, changing, running, scheduling, deploying, upgrading, inspecting, or deleting one, or its table, runs, or diagram.

## Scope

This skill owns `<workspace>/workflows/`, a Vercel Workflow runtime on Nitro copied from `templates/` on first use: workflow files, `db/tables/`, migrations, `vercel.json`, `.env`, the local database, runs, diagram pages, and the deployed copy. Runs execute locally against `data/gtm.db` by default; they target the deployed copy when the user asks or the host states there are no local runs, and hosted results are read through the Studio pair. The workspace files outside `workflows/` belong to the other gtm skills.

## Inputs

The request; the workspace found by [the contract](../gtm-workspace/references/contract.md); the ICP or persona whose criteria the workflow copies; `references/local.md` for commands, keys, and verified facts; `references/deploy.md` for hosting.

## Roles

The user approves code changes through the host's write permission, approves every real run and its cost, connects the workflow project to the repository once and does its dashboard steps, and chooses the AI backend; the agent writes, runs, and reports. Deploy is the push.

## Procedure

Talk by the six rules in [interaction](../gtm-workspace/references/interaction.md); reproduce [the dialogues](references/interactions.md). Workflow slugs follow the contract's slug rule; the display name is the doc comment's first line.

| Job | Do |
| --- | --- |
| Create | First use: scaffold (copy `templates/` to `workflows/`; rename `gitignore` and `env.example` with leading dots; fill `GTM_RUN_SECRET` and `CRON_SECRET` with `openssl rand -hex 24`; `npm install`; on a personal computer start `npm run dev` and `npm run db:studio` in the background; do not run `db:generate`). Ask where the rows come from; ask the backend question only when the workflow has an AI step and the host has local runs (on a host without local runs the Gateway is the only answer, so never ask). Write `workflows/<slug>.ts` from `example-scores.ts`, its table in `db/tables/<name>.ts`, register both in `workflows/index.ts` and `db/tables/index.ts` (keep the example workflow and its table; removing a table in the same generate as adding one makes the generator ask a rename question that no host can answer), run `npm run db:generate -- --name <name>`, restart the dev server, open the diagram page, commit, close with the three where-to-look links and `Saved.`. On a host without local runs: no server, no localhost link; after the push, poll `GET /api/link/<slug>` on the deployed copy until `git merge-base --is-ancestor HEAD <commit>` holds for the `commit` it returns (every 10 seconds, up to 3 minutes), and only then say it is deployed and post the three links; links from an older deployment are dead. When the user then asks to run, propose the limited run; when no connected project exists on a host without local runs, close instead by naming the connection steps in [deploy.md](references/deploy.md). |
| Update | Change the workflow, refresh its criteria copy, add columns (then `db:generate` and restart); ask the backend question only when AI steps change; say the next run will offer a limited run; close with the three links and `Saved.`. |
| Run | Target: local by default on a personal computer; the deployed copy when the user asks or the host states there are no local runs, which needs a connected project and, first, Deploy's readiness check. Pre-run check: the workflow is new or changed since its last run, the row count, rows × estimate against both caps, any missing key. Propose the limited run first for a new or changed workflow. Start through the route, poll the read route, close with the result in plain words: done, failed, skipped, cost, then the three links. Never `Saved.`. When a local run follows a hosted one, say it may re-spend on rows the hosted copy already did. |
| Deploy | Deploy is the push; follow [deploy.md](references/deploy.md) for the one-time connection and the readiness check. A workflow using `headless()`: say the hosted copy runs only in a sandbox with that CLI and login, and offer the Gateway switch through Update. |
| Upgrade | Compare `workflows/` to the installed `templates/`; say what differs; overwrite `lib/`, `server/`, `nitro.config.ts`, `drizzle.config.ts`, `tsconfig.json`; merge dependency versions into `package.json` without removing user-added ones, then delete `package-lock.json` and `node_modules` and run `npm install` fresh (installing over the old lockfile drops other platforms' packages and breaks the hosted build); regenerate `workflows/index.ts` and `db/tables/index.ts`; never touch other files in `workflows/`, `db/tables/`, `drizzle/`, `vercel.json`, `.env`, `data/`; restart and verify the server and a diagram page. |
| Delete | Remove the workflow file, its registry entry, and its `vercel.json` cron; keep the table and its data and say so; when a project is connected, say the hosted copy drops it and its schedule as the save deploys. |

Every save: one sentence on what will change, pull first when `origin/main` exists, edit through the host's write path, commit on `main` with a plain-language message, push when a remote exists, verify the commit (and that it reached `origin/main` when a remote exists), close with `Saved.`.

On a host that states there are no local runs: the backend question has one viable answer, the Gateway, and by rule 3 is not asked; the scaffold deletes `env.example` instead of renaming it and starts no dev server, because the values live in the host's environment; the three links are the deployed copy's, from its link route, once it is live, never localhost; every run targets the deployed copy after the push and after Deploy's readiness check; Upgrade verifies through the deployed diagram page after that check instead of restarting a server. The deployed copy's keys live on the workflow project, which the agent cannot see: never say a key is missing there; propose the limited run, and a failed row names any missing key.

### Conventions the code follows

- Rows come from `defaultInput` (inline), a provider or API call inside a `"use step"` function, or a table another workflow fills; never from a workspace file or local-only data. Input is `{ rows?, maxRows?, maxSpendUsd? }`, each row an object with a required string `key`, the table's primary key; the workflow's constants are the defaults; the start route merges a POST body over `defaultInput`, so the limited run is `POST { maxRows: 1 }`.
- `runRows({ rows, table, step, maxRows, maxSpendUsd, estimateUsd, freshForMs, concurrency? })` from `lib/rows.ts` is the loop; `step(row)` is a plain async function in workflow scope that awaits `"use step"` functions in sequence and returns `{ ...columns, costUsd }`. Tables are passed by name and resolved through `db/tables/index.ts`. About 200 rows per run is the comfortable limit; larger lists are chunked into several runs.
- Every result table has `key`, `updated_at`, `cost_usd`, `error`. All database I/O, every `cached()`, `generateObject`, and `headless()` call happen inside `"use step"` functions declared as `async function name() { "use step"; }`, never arrow or method form; every paid or AI step sets `name.maxRetries = 0`. `WorkflowAgent` runs in workflow scope.
- Backend question, only when the workflow has an AI step, at Create and when AI steps change, and never on a host without local runs: "Run AI steps on your Claude or Codex subscription (this machine only), or through AI Gateway (works hosted too)?"; recommend the subscription when no Gateway key is present and `claude` or `codex` is on PATH, else the Gateway. Each AI step chooses its backend in code: `generateObject` or `WorkflowAgent` with `GTM_MODEL`, or `headless()`; no code path switches between them. `maxUsd` bounds claude spend only.
- Criteria: `export const criteria = \`…\`` holds the ICP or persona text, first line naming it; backticks and `${` are escaped. Nothing else from the workspace is deployed; the copy stays until the next Update.
- Doc comment: first line is the title, second paragraph the one-sentence summary; the diagram page reads both.
- Mermaid house style: `flowchart TB`; one `subgraph` for the per-row loop; classes `paid`, `ai`, `agent`, `save`, `wait`, `sub` applied with `:::`; every `paid`, `ai`, or `agent` node id is the name of a step or agent-stage function in the file; labels are two lines, `Verb object<br/><small>provider · about $X per row</small>`; a `save` node's second line is `table <name>`, a free step's names its source and `free`; the second line of an AI node names the backend (`Claude Code · about $0.01 per row` or `AI Gateway · gpt-5.6-luna · about $0.01 per row`). No `classDef` lines; the page appends them and shows a drift warning when node ids and functions disagree.
- Where to look: every save that changes a workflow and every run closes with three links on their own lines, written as link text, never as bare addresses: `[Open diagram](…)`, `[Open runs](…)`, `[Open data](…)`. Personal computer: `http://localhost:3939/gtm/<slug>`, `http://localhost:3939/_workflow`, `https://local.drizzle.studio`. Host without local runs: `diagramUrl`, `runsUrl`, `dataUrl` from `GET /api/link/<slug>` on the deployed copy after the readiness check; when one is null, name the place in words instead (Observability → Workflows in the Vercel project; Edit Data on the database in Turso).
- Gateways: a paid step that uses a provider found through a gateway tool the host exposes (a data marketplace, an MCP server) calls that gateway from code with the gateway's own key, `<GATEWAY>_API_KEY` in `.env` or the host's variables, never the provider behind it. When the gateway's HTTP API is unknown, read its documentation before writing the step; do not guess.
- Engine features are used natively (see local.md): a hook or `sleep` is a `wait` node, a child workflow a `sub` node, a `WorkflowAgent` stage an `agent` node.
- Routes, bearer `GTM_RUN_SECRET`: `POST /api/run/<slug>`, `GET /api/run/<slug>` (cron, also `CRON_SECRET`), `GET /api/runs/<id>`, `POST /api/runs/<id>/cancel`, `GET /api/link/<slug>`. Base: `http://localhost:3939` locally, `GTM_WORKFLOW_URL` for the deployed copy. When `GTM_RUN_SECRET` is the value `host`, the host supplies the credential outside the agent's reach and the call sends no `Authorization` header.

## Outputs

`workflows/<slug>.ts`, its table and migration, registry entries, a `vercel.json` cron when scheduled, a diagram page, rows in the result table, and, once a project is connected, the deployed copy that every push refreshes.

## Exceptions

Requires the `gtm-workspace` skill installed alongside this one; when `../gtm-workspace/SKILL.md` is missing, say: install it the same way this skill was installed, with `npx skills add eliasstravik/gtm-skills -s gtm-workspace -y` (add `-g` when this skill lives in the global skills directory), then retry. A missing key stops a run before it starts and is named. A build with `VERCEL` set and no Turso variables fails on purpose; report it. A run on the deployed copy needs a connected project; without `GTM_WORKFLOW_URL`, give Deploy's connection steps instead. A `workflows/` that contains `scripts/gtm.ts` is the previous runtime, which this skill neither converts nor upgrades: say so, and offer to set it aside (remove `workflows/`, which stays in the workspace's history; its deployed copy keeps running until the next push) and scaffold fresh.

## QC

- The diagram's `paid`, `ai`, and `agent` node ids match function names and every `"use step"` function is a node; the page shows no drift warning.
- The limited run was proposed before the first real run of a new or changed workflow, and the cap statement preceded every real run.
- The result table has the four fixed columns; paid and AI steps have `maxRetries = 0`; no `cached()`, `generateObject`, or `headless()` call sits in workflow scope.
- A Run reply ends with the plain-words result; a save ends with `Saved.`.

## References

[interactions](references/interactions.md) dialogues; [local.md](references/local.md) for start, keys, data, schedules, tables, the viewer, the WorkflowAgent stage, and the findings ledger; [deploy.md](references/deploy.md); `templates/workflows/example-scores.ts` as the reference implementation; from gtm-workspace: [interaction](../gtm-workspace/references/interaction.md), [contract](../gtm-workspace/references/contract.md).
