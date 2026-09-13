# Local runtime

Contents: [Start](#start) · [Keys](#keys) · [Backends](#backends) · [Data](#data) · [Schedules](#schedules) · [Tables](#tables) · [Engine viewer](#engine-viewer) · [WorkflowAgent stage](#workflowagent-stage) · [Verified versions](#verified-versions) · [Build-time findings](#build-time-findings) · [Unverified until first deploy](#unverified-until-first-deploy)

## Start

- Scaffold, once per workspace: copy the skill's `templates/` to `<workspace>/workflows/`; rename `gitignore` to `.gitignore` and `env.example` to `.env`; fill `GTM_RUN_SECRET` and `CRON_SECRET` with `openssl rand -hex 24`; `npm install`; then start the server. On a host without local runs, delete `env.example` instead and start no server; commit `package-lock.json` so the hosted build and other checkouts install the same packages. There is no `nitro prepare` in Nitro 3; `tsconfig.json` extends `nitro/tsconfig` and the first `nitro dev` generates the rest. Do not run `db:generate` at scaffold; `drizzle/0000_init.sql` already covers `cache` and `example_scores`.
- `npm run dev` from `workflows/` runs `drizzle-kit migrate` then `nitro dev --port 3939`. When `http://localhost:3939` does not answer, start it in the background and wait for `Listening on`.
- Routes, bearer `GTM_RUN_SECRET`: `POST /api/run/<slug>` with a JSON body merged over `defaultInput` (`{ "maxRows": 1 }` is the limited run); `GET /api/run/<slug>` is the cron form and also accepts `CRON_SECRET`; `GET /api/runs/<id>` returns `{ status, output, error }` with status `pending`, `running`, `completed`, `failed`, or `cancelled`; `POST /api/runs/<id>/cancel`; `GET /api/link/<slug>` returns `{ diagramUrl, commit }`, where `commit` is the deployed git commit, `null` locally. Poll the read route every few seconds until a terminal status. The deployed copy answers the same routes at `GTM_WORKFLOW_URL`.
- Diagram page: `http://localhost:3939/gtm/<slug>`; no token locally, `?t=` required on Vercel. The page needs internet for Mermaid from cdnjs.

## Keys

`.env` holds `GTM_RUN_SECRET`, `CRON_SECRET`, `GTM_MODEL` (default `openai/gpt-5.6-luna`), optional `AI_GATEWAY_API_KEY` for Gateway steps, and once a project is connected `GTM_WORKFLOW_URL`, `TURSO_STUDIO_URL` (an `https://` URL), and `TURSO_STUDIO_TOKEN` (read-only). `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are Vercel project variables only. Nitro loads `.env` in dev; `drizzle.config.ts` loads it with `process.loadEnvFile`. Precedence: values already in the process environment (`GTM_WORKFLOW_URL`, `GTM_RUN_SECRET`, `TURSO_STUDIO_URL`, `TURSO_STUDIO_TOKEN`) win over `.env`; when a value is in neither, a host with local runs asks the user to put it in `.env` (rule 6), and a host without local runs names the values to place on the host and never asks for them in the conversation. The value `host` for `GTM_RUN_SECRET` or `TURSO_STUDIO_TOKEN` means the host supplies that credential outside the agent's reach: the route call sends no `Authorization` header and the `@libsql/client` call passes no `authToken`.

## Backends

- Gateway: `generateObject({ model: process.env.GTM_MODEL, schema, prompt })` inside a `"use step"` function; `WorkflowAgent` in workflow scope. Locally this needs `AI_GATEWAY_API_KEY`. Gateway cost arrives asynchronously, so `costUsd` is the declared estimate.
- Subscription: `headless({ cli: "claude" | "codex", prompt, schema, tools?, maxUsd? }, estimateUsd)` inside a `"use step"` function, this machine only. `tools` maps a name to a local command `{ command, args? }` or a hosted MCP server `{ url, headers? }`. `maxUsd` is enforced by claude alone. One scoring call through `claude -p` reported `total_cost_usd` between $0.06 and $0.18 on the build machine, so set `maxUsd` to at least 0.5 per call; that reported figure is what `cost_usd` records, though a subscription is not billed per call.
- Cursor and OpenCode users have no subscription CLI; they use the Gateway.

## Data

- Local runs always use `file:./data/gtm.db`. Read it with `npm run db:studio` or a one-off `@libsql/client` query from `workflows/`.
- Hosted data: `npm run db:studio:turso`, or the same one-off with `url: TURSO_STUDIO_URL` and `authToken: TURSO_STUDIO_TOKEN`, the `authToken` omitted when the token is `host`. Local and hosted data never merge.
- Runs live only in the engine; `npx workflow inspect runs` lists them.

## Schedules

`vercel.json` `crons` is the single source. Locally `server/plugins/schedule.ts` starts each due workflow with `defaultInput` in UTC while the dev server runs; missed times are not caught up, and skip-if-fresh is the only dedupe against a manual run the same day. The plugin is off when `VERCEL` is set.

## Tables

A new or changed table: add or edit `db/tables/<name>.ts`, register it in `db/tables/index.ts`, run `npm run db:generate -- --name <name>`, and restart the dev server, because migrations run only in `dev` and `build`. Every result table starts with `key`, `updated_at`, `cost_usd`, `error`.

## Engine viewer

`/_workflow` on the dev server shows runs and steps. It is on in dev, off in production builds, and never mounted on Vercel (adapter option `dashboard`, default `nitro.options.dev`; confirmed absent from both production bundles).

## WorkflowAgent stage

Verified against types only (`@ai-sdk/workflow` 2.0.30, `@ai-sdk/mcp` 2.0.49); workflow scope, diagram node `researchAccount:::agent`, cost is the estimate:

```ts
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { WorkflowAgent } from "@ai-sdk/workflow";
import { Output, stepCountIs } from "ai";
import { z } from "zod";

const Brief = z.object({ summary: z.string(), nextStep: z.string() });
const ESTIMATE_USD = 0.05;

async function researchAccount(domain: string) {
  const mcp = await createMCPClient({ transport: new Experimental_StdioMCPTransport({ command: "npx", args: ["-y", "@example/mcp-server"] }) });
  const agent = new WorkflowAgent({ model: process.env.GTM_MODEL ?? "openai/gpt-5.6-luna", instructions: "Research the company with the tools and report in two sentences.", tools: await mcp.tools(), stopWhen: stepCountIs(6) });
  const result = await agent.stream({ prompt: `Research ${domain}.`, output: Output.object({ schema: Brief }) });
  await mcp.close();
  return { value: result.output, costUsd: ESTIMATE_USD };
}
```

Other engine features are used natively and documented at workflow-sdk.dev: hooks (`defineHook`, `createHook`) for approval, `sleep`, child workflows (`start` inside a step), `getRun(id).cancel()`, `FatalError` and `maxRetries`. Diagram nodes: `wait` for a hook or sleep, `sub` for a child workflow.

## Verified versions

On 2026-09-12: claude 2.1.269, codex-cli 0.154.0, node 22.23.2, npm 10.9.8, `npx skills` with `-s`, `-g`, `-y`, Mermaid 11.15.0 on cdnjs (HTTP 200). Packages are pinned in `templates/package.json`; `workflow` 5.0.0-beta.51 because `@ai-sdk/workflow` 2.0.30 requires `^5.0.0-beta.42` and rejects 4.8.8.

## Build-time findings

1. `"use step"` functions defined in `lib/rows.ts` compile and run when called from a workflow; `workflow.dirs` is `["workflows", "lib"]` and imported modules are bundled. `runRows`, a plain function imported from `lib/`, ran in workflow scope with step functions passed as values. No fallback layout was needed.
2. `Date.now()` for `updated_at` is called only inside `saveRow` and `readFresh`.
3. Adapter: `workflow/nitro` re-exports `@workflow/nitro` 5.0.0-beta.51; Nitro 3.0.260903-beta with `serverDir: "./server"`, routes in `server/api` and `server/routes`, plugins in `server/plugins`, `serverAssets` resolved from the project root and read with `useStorage("assets:workflows").getItem("<slug>.ts")`. The `workflow` config key needs `import type {} from "workflow/nitro"` for its types.
4. Nested `claude -p` launched from a dev server that was itself started inside a Claude Code session; `headless()` strips every `CLAUDE*` variable. No subscription-path escalation was needed.
5. claude flags: `-p --output-format json --json-schema <json> --tools "" --strict-mcp-config --max-budget-usd <n>`, plus `--mcp-config <file> --allowedTools mcp__*` when tools are given; the reply carries `structured_output` and `total_cost_usd`. `--bare` skips keychain reads and reports "Not logged in", so it is not used. `--max-budget-usd 0.05` aborted with `budget_exhausted` because one call cost more. zod's `toJSONSchema` adds a `$schema` key that `--json-schema` rejects; `headless()` strips it.
6. codex flags: `exec - --output-schema <file> --sandbox read-only --skip-git-repo-check --ephemeral -o <file>`; the prompt is read from stdin; there is no turn-cap flag, so `maxTurns` is informational; MCP servers pass as `-c mcp_servers.<name>.command=...` for local commands or `-c mcp_servers.<name>.url=...` with `http_headers` for hosted servers. The codex path was checked against `--help` only, not executed.
7. `openai/gpt-5.6-luna` is listed by the Gateway model endpoint (375 models), so no substitute model decision was needed.
8. Nitro's Vercel preset has no cron handling; `nitro.config.ts` passes `vercel.json`'s crons through `vercel.config.crons` and the built `.vercel/output/config.json` contains them.
9. drizzle-kit `dialect: "turso"` accepts `file:` URLs, so one dialect serves local and hosted; `schema` points at `db/tables/index.ts` so re-exports register each table once; `generate` and `migrate` ran clean; `drizzle.config.ts` creates `data/` first.
10. Runs through the routes: a limited run (`done 1`), a failed row charged its estimate with the error saved and retried on the next run, a full run that skipped the fresh row (`done 2, skipped 1`), a cancel that ended `cancelled`, the local schedule plugin starting a run, the diagram page with title, summary, schedule line ("every Monday at 08:00 UTC"), no drift banner, and the link route with a token that verified (valid, wrong slug, tampered, missing, expired).
11. `npm run build` and a `NITRO_PRESET=vercel` build both succeed; `@workflow/web` is absent from both outputs.
12. `tsc --noEmit` (TypeScript 5.9) is clean for the whole scaffold, including the WorkflowAgent stage above.
13. `npx skills add <local checkout or repo> -s '*' -a claude-code -y` installs all five skills non-interactively from `skills/<name>/`, templates included; `-s <name>` installs one. A `: ` inside a SKILL.md description breaks the YAML frontmatter and the installer silently skips that skill, so descriptions carry no colon-space.
14. The 200-rows-per-run guidance is authoritative over the 500 in the consultant's facts file.

## Unverified until first deploy

Each ships with its fallback; the Deploy job's first run checks and reports them.

- Whether Vercel honours root `vercel.json` crons under the Nitro preset: the build output carries them anyway (finding 8).
- Whether the workflow project exposes Vercel's system environment variables (the default): the link route's `commit` and Deploy's readiness check need `VERCEL_GIT_COMMIT_SHA`; when the deployed copy answers `commit: null`, that setting is off and the person turns it on and Redeploys.
- The exact env names the Turso marketplace integration sets: assumed `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; `drizzle.config.ts` and `lib/db.ts` throw a clear error if they differ.
- `/_workflow` in production: confirmed absent from the bundle (finding 11); reachability is confirmed on the deployed URL.
