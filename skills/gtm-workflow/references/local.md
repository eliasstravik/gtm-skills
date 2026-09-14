# Local runtime

Contents: [Start](#start) · [Keys](#keys) · [Backends](#backends) · [Data](#data) · [Schedules](#schedules) · [Tables](#tables) · [Engine viewer](#engine-viewer) · [Agent stage](#agent-stage) · [Verified versions](#verified-versions) · [Build-time findings](#build-time-findings) · [Unverified until first deploy](#unverified-until-first-deploy)

## Start

- Scaffold, once per workspace: copy the skill's `templates/` to `<workspace>/workflows/`; rename `gitignore` to `.gitignore` and `env.example` to `.env`; fill `GTM_RUN_SECRET` and `CRON_SECRET` with `openssl rand -hex 24`; `npm install`; then start the server. On a personal computer also start `npm run db:studio` in the background; Drizzle Studio then serves the Data link at `https://local.drizzle.studio`. On a host without local runs, delete `env.example` instead and start no server; commit `package-lock.json` so the hosted build and other checkouts install the same packages. There is no `nitro prepare` in Nitro 3; `tsconfig.json` extends `nitro/tsconfig` and the first `nitro dev` generates the rest. Do not run `db:generate` at scaffold; `drizzle/0000_init.sql` already covers `cache` and `example_scores`.
- `npm run dev` from `workflows/` runs `drizzle-kit migrate` then `nitro dev --port 3939` with the local queue's transport timeouts raised to 15 minutes; without that, a workflow whose body runs longer than 30 seconds inline (an agent stage, typically) is cut, redelivered, and its in-flight paid step counted as a failed attempt. When `http://localhost:3939` does not answer, start it in the background and wait for `Listening on`.
- Routes, bearer `GTM_RUN_SECRET`: `POST /api/run/<slug>` with a JSON body merged over `defaultInput` (`{ "maxRows": 1 }` is the limited run); `GET /api/run/<slug>` is the cron form and also accepts `CRON_SECRET`; `GET /api/runs/<id>` returns `{ status, output, error }` with status `pending`, `running`, `completed`, `failed`, or `cancelled`; `POST /api/runs/<id>/cancel`; `GET /api/link/<slug>` returns `{ diagramUrl, runsUrl, dataUrl, commit, keys }`: locally the diagram page, `/_workflow`, and Drizzle Studio; on Vercel the signed diagram link, `GTM_RUNS_URL`, and `GTM_DATA_URL` (`null` when unset); `commit` is the deployed git commit, `null` locally; `keys` is the sorted list of variable names ending in `_API_KEY` that the copy can see, names never values, so the agent knows which gateway and Gateway keys exist without reading any settings. Poll the read route every few seconds until a terminal status. The deployed copy answers the same routes at `GTM_WORKFLOW_URL`.
- Diagram page: `http://localhost:3939/gtm/<slug>`; no token locally, `?t=` required on Vercel. The page needs internet for Mermaid from cdnjs.

## Keys

`.env` holds `GTM_RUN_SECRET`, `CRON_SECRET`, `GTM_MODEL` (default `openai/gpt-5.6-luna`), optional `GTM_REASONING` (reasoning effort for AI steps and agent stages), optional `AI_GATEWAY_API_KEY` for Gateway steps, optional `EXA_API_KEY` for agent stages with web search on, and once a project is connected `GTM_WORKFLOW_URL`, `TURSO_STUDIO_URL` (an `https://` URL), and `TURSO_STUDIO_TOKEN` (read-only). `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are Vercel project variables only. Nitro loads `.env` in dev; `drizzle.config.ts` loads it with `process.loadEnvFile`. Precedence: values already in the process environment (`GTM_WORKFLOW_URL`, `GTM_RUN_SECRET`, `TURSO_STUDIO_URL`, `TURSO_STUDIO_TOKEN`) win over `.env`; when a value is in neither, a host with local runs asks the user to put it in `.env` (rule 6), and a host without local runs names the values to place on the host and never asks for them in the conversation. The value `host` for `GTM_RUN_SECRET` or `TURSO_STUDIO_TOKEN` means the host supplies that credential outside the agent's reach: the route call sends no `Authorization` header and the `@libsql/client` call passes no `authToken`.

## Backends

- Gateway: `generateObject({ model: process.env.GTM_MODEL, schema, prompt })` inside a `"use step"` function; `runAgent()` in workflow scope. Locally this needs `AI_GATEWAY_API_KEY`, or a Vercel-linked checkout (`.vercel/`) whose OIDC token the Gateway accepts. `generateObject` cost arrives asynchronously, so its `costUsd` is the declared estimate; `runAgent` reads the cost the Gateway reports on each call.
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

## Agent stage

`runAgent()` in `lib/agent.ts` is the one way to put an agent inside a workflow. It runs in workflow scope, so each model call (`doStreamStep`) and each tool call (`fetchPage`, `webSearch`, `callMcpTool`, or a custom step) is its own step in the trace; the stage function is the `agent` node in the diagram. Verified locally on 2026-09-14 against the pinned packages (a company brief through `fetch_page`, four pages, three model calls, $0.002; a public MCP server through `listMcpTools` and `callMcpTool`; a one-step cap that ended in the wrap-up call), and both production builds.

```ts
import { z } from "zod";
import { runAgent } from "../lib/agent";

const Brief = z.object({ summary: z.string(), evidenceUrls: z.array(z.string()) });

/** Workflow scope, no directive: the agent stage. */
async function researchCompany(domain: string) {
  return runAgent({
    name: "researchCompany",
    instructions: "You research B2B companies from their own websites. Never invent facts.",
    skills: ["company-research"],
    tools: {
      web: { fetch: true, search: false },
      mcp: { monid: { url: "https://mcp.monid.ai/v1", keyEnv: "MONID_API_KEY", allow: ["monid_discover", "monid_inspect", "monid_run", "monid_get_run"], maxCalls: 6 } },
    },
    prompt: `Research ${domain} and return the brief.`,
    schema: Brief,
    estimateUsd: 0.05,
    maxSteps: 12,
    maxUsd: 0.5,
    timeout: "5m",
  });
}
```

The result is `{ value, costUsd, modelCalls, toolCalls, stopReason, usage }`: `value` parsed by the zod schema, `costUsd` the Gateway's reported cost across calls plus any cost a tool reported (`{ costUsd }` from our steps, `{ cost: { value, currency: "USD" } }` from a provider), `estimateUsd` when the Gateway reported nothing; `toolCalls` is the trace (`tool`, `input`, `ok`, `costUsd`); `stopReason` is `done`, `maxSteps`, or `maxUsd`. When a cap ends the loop mid-research, the helper makes one more call without tools so the schema still comes back filled from what was found. A `timeout` throws, and the row fails with its estimate charged.

Rules the helper exists to enforce, each learned from a failed hosted run:

- Never inside a step: a `WorkflowAgent` inside a `"use step"` runs as one opaque call with no tool steps, no resumption, and the function's timeout as its ceiling.
- Never `timeout:` on `stream()` and never `AbortSignal.timeout()`: workflow scope has no timers; the helper races `sleep()` against the agent and aborts through an `AbortController`.
- No string formats in schemas: OpenAI's strict output rejects `format: uri` (from `z.string().url()`), the Gateway then falls back to another provider, and the model answers with no tools. The helper strips `format` and `$schema`; authors still use nullable fields rather than optional ones.
- MCP clients live inside steps: a client's `execute` closures use `fetch`, which workflow scope forbids, so `lib/mcp.ts` recreates the client per call from the key on the project and passes only JSON across the boundary; tool definitions are cached an hour in the `cache` table.
- The wrap-up call sends the conversation without its system message; `WorkflowAgent` rejects system messages inside `messages`.
- A tool error is data, not a failure: `callMcpTool` returns `{ isError, error }` and the model reads it and tries another endpoint; the step fails only for a missing key (a `FatalError`, no retries) or a transport failure. `fetch_page` refuses IP literals, local names, and any name that resolves to a private, loopback, link-local, or metadata address, and re-checks every redirect hop, at most three.

Skills are text modules: `skills/<name>.ts` exporting a template string, registered in `skills/index.ts`; the server-asset route the diagram page uses is not visible from the step bundle. Other engine features are used natively and documented at workflow-sdk.dev: hooks (`defineHook`, `createHook`) for approval, `sleep`, child workflows (`start` inside a step), `getRun(id).cancel()`, `FatalError` and `maxRetries`. Diagram nodes: `wait` for a hook or sleep, `sub` for a child workflow.

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
12. `tsc --noEmit` (TypeScript 5.9) is clean for the whole scaffold, including `lib/agent.ts`, `lib/mcp.ts`, `lib/web.ts`, and `example-research.ts`.
13. `npx skills add <local checkout or repo> -s '*' -a claude-code -y` installs all five skills non-interactively from `skills/<name>/`, templates included; `-s <name>` installs one. A `: ` inside a SKILL.md description breaks the YAML frontmatter and the installer silently skips that skill, so descriptions carry no colon-space.
14. The 200-rows-per-run guidance is authoritative over the 500 in the consultant's facts file.
15. Nitro 3 has no `externals` config key; the `@ai-sdk/mcp` import in `lib/mcp.ts` bundles cleanly in both presets without one.
16. `useStorage("assets:…")` answers from a route but not from a step function, so skills are TypeScript modules, not assets.
17. The Gateway's per-call cost is at `step.providerMetadata.gateway.cost` in every `WorkflowAgent` step result; the local runs summed it to the cent the Gateway dashboard shows.
18. The local world's queue delivers a run over one HTTP request with undici's 30-second header timeout; `WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS` and `WORKFLOW_LOCAL_BODY_TIMEOUT_MS` raise it, and the dev script sets both. Vercel's runtime has no such cut.
19. A person enrichment through Monid ran end to end locally on 2026-09-14: 13 model calls, 12 Monid calls (Clay, Ploid, Firecrawl), a matched profile with cited sources, $0.063 for the row, 44 seconds.

## Unverified until first deploy

Each ships with its fallback; the Deploy job's first run checks and reports them.

- Whether Vercel honours root `vercel.json` crons under the Nitro preset: the build output carries them anyway (finding 8).
- Whether the workflow project exposes Vercel's system environment variables (the default): the link route's `commit` and Deploy's readiness check need `VERCEL_GIT_COMMIT_SHA`; when the deployed copy answers `commit: null`, that setting is off and the person turns it on and Redeploys.
- The exact env names the Turso marketplace integration sets: assumed `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; `drizzle.config.ts` and `lib/db.ts` throw a clear error if they differ.
- `/_workflow` in production: confirmed absent from the bundle (finding 11); reachability is confirmed on the deployed URL.
