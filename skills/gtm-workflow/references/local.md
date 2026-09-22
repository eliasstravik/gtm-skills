# Local runtime

Contents: [Start](#start) · [Keys](#keys) · [Backends](#backends) · [Data](#data) · [Local database](#local-database) · [Cost on Neon](#cost-on-neon) · [Schedules](#schedules) · [Tables](#tables) · [Engine viewer](#engine-viewer) · [Agent stage](#agent-stage) · [Fan-out, intake, notify](#fan-out-intake-notify) · [Verified versions](#verified-versions) · [Build-time findings](#build-time-findings) · [Unverified until first deploy](#unverified-until-first-deploy)

## Start

- Run the trusted skill's `scripts/setup.mjs --workspace <path> --local` once. It creates an empty runtime, installs the pinned Connections component, stores machine credentials in the OS store, and prepares the local database (it starts this workspace's Postgres, migrates it and stops it again). It starts no workflows and needs no Vercel account. See [Connections](connections.md).
- Open Connections through `scripts/connections.mjs open --workspace <path> --target local`. Use `npm run viewer` for inspection. Start `npm run dev` from `workflows/` only when execution is intended. The trusted launcher loads managed keys for that execution process, disables Nitro dotenv reload, and preserves the queue's 15-minute transport timeout. Restart deliberately to apply connection changes.
- Routes, bearer `GTM_RUN_SECRET`: `POST /api/run/<slug>` with a JSON body merged over `defaultInput` (`{ "maxRows": 1 }` is the limited run); `GET /api/run/<slug>` is the cron form and also accepts `CRON_SECRET`; `GET /api/runs/<id>` returns `{ status, output, error, approvals }` with status `pending`, `running`, `completed`, `failed`, or `cancelled`, and `approvals` the run's human-approval requests (`token`, `stage`, `tool`, `input`, `requestedAt`, `decidedAt`, `approved`, `reason`), pending first; `POST /api/runs/<id>/approve` with `{ token, approved, reason? }` resumes the waiting tool; `GET /api/runs/<id>/stream` (optional `startIndex`) is one JSON object per line while an agent stage streams (`text`, `reasoning`, `tool-call`, `tool-result`, `tool-error`, `model-call-done`, `done`) and ends with the run; `POST /api/runs/<id>/cancel`; `GET /api/link/<slug>` returns `{ diagramUrl, runsUrl, dataUrl, commit, keys }`: the private Logic, Runs and Data URLs, all served by the same viewer locally and hosted; `commit` is the deployed git commit, `null` locally; `keys` is the sorted list of variable names ending in `_API_KEY` that the copy can see, names never values, so the agent knows which gateway and Gateway keys exist without reading any settings. Poll the read route every few seconds until a terminal status. The deployed copy answers the same routes at `GTM_WORKFLOW_URL`.
- Diagram page: `http://localhost:3939/gtm/<slug>`; no token locally, `?t=` required on Vercel. The page needs internet for Mermaid from cdnjs.

## Keys

Enter provider keys through Connections. The manager stores them in the OS credential store and never writes them to `.env`. Existing keys in the environment or `.env` remain visible as Configured externally. Managed saves override those values; disconnect tombstones prevent them from returning on supported launches.

Keep ordinary settings such as `GTM_MODEL`, `GTM_REASONING`, `GTM_AGENT_BACKEND`, and `GTM_WORKFLOW_URL` in `.env`. The trusted launcher reads process settings before `.env.local` before `.env`, then applies managed definitions last. Build, migration and inspection children receive no provider keys. Bare custom commands bypassing the launcher cannot claim managed-key activation. Never print credentials or ask for them in conversation. The hosted database URLs stay in their Vercel project; the launcher removes every `DATABASE_URL*`, `PG*` and `POSTGRES_*` variable from a local run, so a `.env` pulled from Vercel can never point local work at production. The host sentinel `GTM_RUN_SECRET=host` still means the host supplies authorization outside the model's reach.

## Backends

- Gateway: `generateObject({ model: process.env.GTM_MODEL, schema, prompt })` inside a `"use step"` function; `runAgent()` in workflow scope. On Vercel the deployed copy authenticates with the project's OIDC token, which the Gateway provider picks up by itself, so the workflow project holds no Gateway key. Locally this needs `AI_GATEWAY_API_KEY`, or a Vercel-linked checkout (`.vercel/`) whose OIDC token the Gateway accepts. `generateObject` cost arrives asynchronously, so its `costUsd` is the declared estimate; `runAgent` reads the cost the Gateway reports on each call.
- Subscription: `GTM_AGENT_BACKEND=claude` or `codex` in `.env`, this machine only; `runAgent` reads it from the frozen environment at run time, so the same file takes the Gateway on the hosted copy, where the variable does not exist. The whole stage is one step through the CLI (`lib/cli.ts`), killed at the stage's `timeout` (default 10 minutes, under the local queue's 15-minute cut); MCP servers and web tools carry over (claude: WebSearch and WebFetch; codex: `web_search="live"`); a stage with custom tools, `approve`, `stream`, `messages`, `agent`, or `call` takes the Gateway instead, because the CLI cannot do those; codex needs each MCP server's `allow` list because its tools run unattended only when named with `approval_mode="approve"`. claude reports `total_cost_usd` (one probe cost $0.13 on the build machine; set `maxUsd` accordingly); codex reports nothing, so `costUsd` is the estimate. `backend` on a stage overrides the variable for that stage; on Vercel it is ignored.
- Web search is never a step: `web: { search: true }` is Exa executed by AI Gateway (`gateway.tools.exaSearch()`, any model, no key, billed on the Gateway inside the call); `"openai"` is OpenAI's own web search (`openai.tools.webSearch()`, openai/* models only). Neither can be approved or call-limited. On a CLI backend the CLI's native search is used.
- Cursor and OpenCode users have no subscription CLI; they use the Gateway.

## Data

- The database is Postgres everywhere: this workspace's own local server while `npm run dev` or `npm run viewer` runs, Neon when deployed. The code is the same; only `DATABASE_URL` differs. Local and hosted data never merge.
- Read it through `POST <origin>/api/query` with the bearer and `{ "sql": "select key, score from example_scores where score > $1 limit 50", "args": [50] }`, which returns `{ columns, rows, truncated }`. Locally `<origin>` is `http://127.0.0.1:3939`, hosted it is `GTM_WORKFLOW_URL`. `npm run db:studio` opens Drizzle Studio on the local database.
- The query route takes one Postgres statement with parameters `$1`, `$2`, …. Postgres itself keeps it read-only, and it has 5 seconds and 1,000 rows at most, so name columns and add `LIMIT`. Workflow result tables are in schema `public` (`example_scores`); runtime tables are in schema `gtm` (`gtm.people`, `gtm.companies`, `gtm.cache`, …), and their plain names also resolve inside the route. Find tables and columns in `information_schema.tables` and `information_schema.columns` for schemas `public` and `gtm`.
- Types: `*_json` columns are `jsonb`, so use `->>` and `@>` (`sources_json @> '[{"workflow_id":"…"}]'`, `jsonb_array_elements(experiences_json)`); times are `timestamptz` and arrive as ISO text; flags are `boolean`. `count(*)` is a `bigint` and arrives as text unless cast: write `count(*)::int`.
- The app's pool holds 16 connections (`GTM_DB_POOL_MAX`, at most 32): the network workflow's twelve workers plus readers. Write transactions beyond the pool's capacity wait in memory, so reads always find a client.
- Runs live only in the engine; `npx workflow inspect runs` lists them.

## Local database

- `npm run dev` and `npm run viewer` start a real Postgres 18 from the `embedded-postgres` package in `workflows/node_modules`, for this workspace only, and stop it on exit. Its data is `workflows/data/pg`, its log `workflows/data/postgres.log`; `data/` is never committed.
- The port is chosen freely at each start and written by Postgres to `data/pg/postmaster.pid`. There is no port setting and no URL file. Every local script gets the URL from `scripts/local-database.mjs`, which first asks the server which folder it serves, so one workspace's scripts can never reach another workspace's database. When nothing is running they say: start `npm run dev` first.
- The app connects as the plain role `gtm` with a fixed password; the server listens on `127.0.0.1` only. A launcher that crashed leaves its server running: the next start recognises it, reuses it and stops it on exit. `data/launcher.pid` names the launcher that owns the database; a second one for the same workspace is refused.
- `npm run dev` migrates after the database is up. `npm run viewer` never migrates and needs a database that setup or an earlier `npm run dev` created.
- `GTM_DATABASE=external`, set in the shell that runs the command and never read from `.env`, is the one way out: with `DATABASE_URL` (and optionally `DATABASE_URL_UNPOOLED`) in that same shell the launcher starts nothing, uses that Postgres and never migrates it. Migrating it is an explicit `GTM_DATABASE=external node scripts/migrate.mjs`.
- The local server starts with `fsync`, `synchronous_commit` and `full_page_writes` off and minimal WAL (`LOCAL_SERVER_OPTIONS` in the Connections launcher, applied at every start): a throwaway database rebuilt from migrations and imports needs no crash durability, and an enrichment commits twice per item. Nothing of this reaches Neon.
- Postgres does not run as root. `embedded-postgres` pins the Postgres major version and a later major cannot read an older `data/pg`: dump before bumping `embedded-postgres` across a major.
- Migrations only add. A backfill is a migration, so it runs once. Nothing that scans a table runs on every build.

## Cost on Neon

Neon bills the time the compute is awake and the storage used, not rows read. The ceiling is the maximum compute size, 0.25 CU. The Free plan's 100 compute-hours at 0.25 CU are 400 awake hours of the roughly 730 in a month, and the database sleeps after 5 idle minutes. So a schedule or a poll that touches the database every few minutes keeps it awake and stops production mid-month, while a daily or weekly schedule costs minutes. Never select `responses_json` or `provenance_json` in bulk. Page by key (`WHERE key > $1 ORDER BY key LIMIT $2`), not with `OFFSET`.

## Schedules

`vercel.json` `crons` is the single source. Locally `server/plugins/schedule.ts` starts each due workflow with `defaultInput` in UTC while the dev server runs; missed times are not caught up, and skip-if-fresh is the only dedupe against a manual run the same day. The plugin is off when `VERCEL` is set.

## Tables

A new or changed table: add or edit `db/tables/<name>.ts` with `pgTable`, register it in `db/tables/index.ts`, run `npm run db:generate -- --name <name>` (it needs no database), and restart the dev server, because migrations run only in `dev` and in the production `build`. Every result table starts with `key`, `updated_at`, `cost_usd`, `error`. Use `text`, `integer`, `doublePrecision` for money, `boolean` for flags, `jsonb` for `*_json` columns and `timestamp("…", { withTimezone: true })` for times, which are read and written as `Date`.

`db/tables/` holds the workspace's result tables only. The runtime's own tables (`cache`, `people`, `companies`, `profile_identifiers`, `profile_runs`, `profile_work`, `profile_attempts`, `profile_inputs`, `gtm_viewer_grants`) are defined in `lib/schema/`, live in schema `gtm` and are migrated from `drizzle-runtime/`, which upgrades replace. Their names are reserved: a workspace table that uses one is refused when the app loads.

## Engine viewer

Use `npm run viewer` to browse the existing local database at `http://127.0.0.1:3939/viewer`. It compiles display artifacts, binds to loopback, disables recovery, and serves only viewer reads. It does not start the development runtime, migrate data, register schedules or execute workflows. Set `GTM_VIEWER_PORT` when the deliberate execution runtime already uses 3939. Initialize the database and viewer metadata explicitly before first use.

`npm run dev` remains the deliberate execution runtime and can start due schedules. Do not use it as a prerequisite to inspecting saved runs. See [viewer](viewer.md) for graph provenance, share permissions and the hosted native gate.

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

Beyond the example: `approve: ["monid_run"]` makes each such call wait for a person (`guardTools` creates a hook keyed by the tool call id, records the request in the `cache` table under the name `approval`, and returns the person's refusal to the model as a tool error); `stream: true` writes every event to the run's stream; omitting `schema` returns text; `messages` instead of `prompt` continues a conversation; `agent` and `call` pass every remaining WorkflowAgent option through (a passed `stopWhen` is added to the helper's caps). The result is `{ value, costUsd, modelCalls, toolCalls, stopReason, usage }`: `value` parsed by the zod schema, `costUsd` the Gateway's reported cost across calls plus any cost a tool reported (`{ costUsd }` from our steps, `{ cost: { value, currency: "USD" } }` from a provider), `estimateUsd` when the Gateway reported nothing; `toolCalls` is the trace (`tool`, `input`, `ok`, `costUsd`); `stopReason` is `done`, `maxSteps`, or `maxUsd`. When a cap ends the loop mid-research, the helper makes one more call without tools so the schema still comes back filled from what was found. A `timeout` throws, and the row fails with its estimate charged.

Rules the helper exists to enforce, each learned from a failed hosted run:

- Never inside a step: a `WorkflowAgent` inside a `"use step"` runs as one opaque call with no tool steps, no resumption, and the function's timeout as its ceiling.
- Never `timeout:` on `stream()` and never `AbortSignal.timeout()`: workflow scope has no timers; the helper races `sleep()` against the agent and aborts through an `AbortController`.
- No string formats in schemas: OpenAI's strict output rejects `format: uri` (from `z.string().url()`), the Gateway then falls back to another provider, and the model answers with no tools. The helper strips `format` and `$schema`; authors still use nullable fields rather than optional ones.
- MCP clients live inside steps: a client's `execute` closures use `fetch`, which workflow scope forbids, so `lib/mcp.ts` recreates the client per call from the key on the project and passes only JSON across the boundary; tool definitions are cached an hour in the `cache` table.
- The wrap-up call sends the conversation without its system message; `WorkflowAgent` rejects system messages inside `messages`.
- Route-side code stays out of workflow modules: a plain function that touches the database in a module the workflow imports drags the native database client into the workflow bundle, which fails at start with `require is not defined`; `lib/approval-api.ts` exists for that reason and nothing under a workflow imports it.
- A tool error is data, not a failure: `callMcpTool` returns `{ isError, error }` and the model reads it and tries another endpoint; the step fails only for a missing key (a `FatalError`, no retries) or a transport failure. `fetch_page` refuses IP literals, local names, and any name that resolves to a private, loopback, link-local, or metadata address, and re-checks every redirect hop, at most three.

Skills are text modules: `skills/<name>.ts` exporting a template string, registered in `skills/index.ts`; the server-asset route the diagram page uses is not visible from the step bundle. Other engine features are used natively and documented at workflow-sdk.dev: hooks (`defineHook`, `createHook`) for approval, `sleep`, child workflows (`start` inside a step), `getRun(id).cancel()`, `FatalError` and `maxRetries`. Diagram nodes: `wait` for a hook or sleep, `sub` for a child workflow.

## Fan-out, intake, notify

- Fan-out: `runRows` with `fanOut: { workflow, input, chunkSize }` splits a list above `chunkSize` into child runs of the same workflow (`start({ workflowId })` inside a step; the function's `workflowId` is read in workflow scope), four at a time, a wave started and recorded in one step, each child capped at its chunk (`maxRows: chunk.length`, `maxSpendUsd: chunk.length × estimate`), reporting back through a hook `<parent run>:chunk:<n>` that the child resumes from a step at its end. Inside a run, finished rows are saved in groups of ten (`saveEvery`) through one `saveRows` step. `runNetwork` in `lib/profiles/network-workflow.ts` does the same for a network enrichment: chunks of 100 people, then of 100 companies, become children (`<parent run>:<phase>:chunk:<n>`) that share the parent's run, lease and budget. Child ids are recorded in the `cache` table under the name `children`, and the cancel route cancels them with the parent. Verified: 3 rows, chunk size 1, one parent and three children, totals summed, every row saved. Event budget: the engine caps a run at 25,000 events and replay slows past about 2,000; a hosted one-row Monid stage produced about 120 events (36 steps, three events each, plus hooks), so agent workflows use `chunkSize` 20 and plain-step workflows 100.
- Attributes: `runRows` tags every run with `workflow`, `rows`, `channel` (when the input names one), and `parent` (on a child), so the Vercel runs page and `workflow inspect runs --attribute workflow=<slug>` can filter them.
- Intake: `defineIntake` in the workflow file is workflow-safe; `lib/intake-api.ts` does the HMAC check (constant time), the 30-day dedupe in the `cache` table under the name `intake`, and the mapping; the route starts the run. Verified with a signed body.
- Notify: `lib/notify.ts` posts `{ runId, workflow, kind, text, approval?, target? }` to `GTM_AGENT_URL/gtm/notify` with `GTM_NOTIFY_SECRET`; the agent's route posts the text top-level in Slack at `target` (`{ channelId }`; there is no thread option, so a run started from a conversation never posts back into it), else the agent project's fallback channel, with the agent's bot token and no model call; the route answers 502 when Slack refuses, so the step's two retries cover a rate limit. `ask` and `handoff` posts open a thread the agent watches for replies. `runRows` takes `notify: { target, every, line? }` and posts per row, per chunk, or once with the totals; `line` returns a string, or `{ text, blocks }` for a rich per-row post (a `show` with Slack blocks). A stage's `notify` option sets the target for its approval requests; `false` silences them. An approval inside a stage notifies by itself when both variables are present (`canNotify()` reads the workflow's frozen environment). Verified against a local listener, then hosted on 2026-09-14: three approvals answered from Slack, each resuming the run.
- Bundle rule: a module a workflow imports must not reach the database or the runtime outside a `"use step"` body; plain helpers that do so drag the native client into the workflow bundle, which fails at start with `require is not defined`. Route-only code lives in `lib/approval-api.ts` and `lib/intake-api.ts`.

## Verified versions

On 2026-09-12: claude 2.1.269, codex-cli 0.154.0, node 22.23.2, npm 10.9.8, `npx skills` with `-s`, `-g`, `-y`, Mermaid 11.15.0 on cdnjs (HTTP 200). Packages are pinned in `templates/package.json`; `workflow` 5.0.0-beta.51 because `@ai-sdk/workflow` 2.0.30 requires `^5.0.0-beta.42` and rejects 4.8.8.

## Build-time findings

1. `"use step"` functions defined in `lib/rows.ts` compile and run when called from a workflow; `workflow.dirs` is `["workflows", "lib"]` and imported modules are bundled. `runRows`, a plain function imported from `lib/`, ran in workflow scope with step functions passed as values. No fallback layout was needed.
2. `Date.now()` for `updated_at` is called only inside `saveRow`, `saveRows` and `readFresh`.
3. Adapter: `workflow/nitro` re-exports `@workflow/nitro` 5.0.0-beta.51; Nitro 3.0.260903-beta with `serverDir: "./server"`, routes in `server/api` and `server/routes`, plugins in `server/plugins`, `serverAssets` resolved from the project root and read with `useStorage("assets:workflows").getItem("<slug>.ts")`. The `workflow` config key needs `import type {} from "workflow/nitro"` for its types.
4. Nested `claude -p` launched from a dev server that was itself started inside a Claude Code session; `lib/cli.ts` strips every `CLAUDE*` variable. No subscription-path escalation was needed.
5. claude flags: `-p --output-format json --json-schema <json> --tools "" --strict-mcp-config --max-budget-usd <n>`, plus `--mcp-config <file> --allowedTools mcp__*` when tools are given; the reply carries `structured_output` and `total_cost_usd`. `--bare` skips keychain reads and reports "Not logged in", so it is not used. `--max-budget-usd 0.05` aborted with `budget_exhausted` because one call cost more. zod's `toJSONSchema` adds a `$schema` key that `--json-schema` rejects; `sanitizeSchema` strips it.
6. codex flags: `exec - --output-schema <file> --sandbox read-only --skip-git-repo-check --ephemeral -o <file>`; the prompt is read from stdin; MCP servers pass as `-c mcp_servers.<name>.url=...` with `http_headers`, and each allowed tool as `-c mcp_servers.<name>.tools.<tool>.approval_mode="approve"` (the only value that runs unattended; `never` and `auto` are refused or blocked). Executed on 2026-09-14: two MCP calls, structured output back.
7. `openai/gpt-5.6-luna` is listed by the Gateway model endpoint (375 models), so no substitute model decision was needed.
8. Nitro's Vercel preset has no cron handling; `nitro.config.ts` passes `vercel.json`'s crons through `vercel.config.crons` and the built `.vercel/output/config.json` contains them.
9. Verified on 2026-09-20 with `pg` 8.23.0, `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10 and `embedded-postgres` 18.4.0-beta.17: two drizzle-kit configs (`schemaFilter` `public` and `gtm`) generate SQL that never mentions the other's tables; the programmatic migrator applies both folders as the plain role with two journals in schema `drizzle`; `pg` bundles under Nitro, inside a `"use step"` function and under esbuild with no `external` setting; the local server starts, is reused after a killed launcher and stops on macOS, Linux and Windows. In raw SQL a JavaScript array is never interpolated: a list is `= ANY(${sql.param(list)}::text[])` and `jsonb` is `${JSON.stringify(value)}::jsonb`.
10. Runs through the routes: a limited run (`done 1`), a failed row charged its estimate with the error saved and retried on the next run, a full run that skipped the fresh row (`done 2, skipped 1`), a cancel that ended `cancelled`, the local schedule plugin starting a run, the diagram page with title, summary, schedule line ("every Monday at 08:00 UTC"), no drift banner, and the link route with a token that verified (valid, wrong slug, tampered, missing, expired).
11. `npm run build` and a `NITRO_PRESET=vercel` build both succeed; `@workflow/web` is absent from both outputs.
12. `tsc --noEmit` (TypeScript 5.9) is clean for the whole scaffold, including `lib/agent.ts`, `lib/mcp.ts`, `lib/web.ts`, and `example-research.ts`.
13. `npx skills add <local checkout or repo> -s '*' -a claude-code -y` installs all five skills non-interactively from `skills/<name>/`, templates included; `-s <name>` installs one. A `: ` inside a SKILL.md description breaks the YAML frontmatter and the installer silently skips that skill, so descriptions carry no colon-space.
14. The 200-rows-per-run guidance is authoritative over the 500 in the consultant's facts file.
15. Nitro 3 has no `externals` config key; the `@ai-sdk/mcp` import in `lib/mcp.ts` bundles cleanly in both presets without one.
16. `useStorage("assets:…")` answers from a route but not from a step function, so skills are TypeScript modules, not assets.
17. The Gateway's per-call cost is at `step.providerMetadata.gateway.cost` in every `WorkflowAgent` step result; the local runs summed it to the cent the Gateway dashboard shows.
18. The local world's queue delivers a run over one HTTP request with undici's 30-second header timeout; `WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS` and `WORKFLOW_LOCAL_BODY_TIMEOUT_MS` raise it, and the dev script sets both. Vercel's runtime has no such cut.
19. Verified on 2026-09-14 in the scaffold: streaming through the stream route (171 events for one row), an approval round trip through the read and approve routes, a denial the model reported honestly, text output, and `temperature`, `onStepEnd`, and `activeTools` passed through; both production builds pass.
20. Fan-out, intake, notify, and both CLI backends verified in the scaffold on 2026-09-14; the pattern snippets in patterns.md compiled and ran.
21. A person enrichment through Monid ran end to end locally on 2026-09-14: 13 model calls, 12 Monid calls (Clay, Ploid, Firecrawl), a matched profile with cited sources, $0.063 for the row, 44 seconds.

22. Confirmed on the first connected project on 2026-09-14: the workflow project exposes `VERCEL_GIT_COMMIT_SHA` (system variables on by default), the database integration sets its variables on the project, and `/_workflow` answers 404 on the production URL. Hosted runs are listed by `npx workflow inspect runs --backend vercel` from a checkout linked to the workflow project with `vercel link`; the Eve sandbox has no Vercel login, so there the runs link is the only view.

23. Verified in a scratch scaffold on 2026-09-14 against the pinned packages: an agent stage on `GTM_AGENT_BACKEND=codex` ran as one `runAgentCli` step and saved its row; the same file with the variable unset ran through the Gateway with `web: { search: true }` (three `exa_search` calls inside the model-call steps, four `fetch_page` steps, $0.0023); a fanned-out run of three children was cancelled through the cancel route and all four runs read `cancelled`; every run carried the `workflow` and `rows` attributes. `tsc --noEmit` and both production builds pass.

## Unverified until first deploy

Each ships with its fallback; the Deploy job's first run checks and reports them.

- Whether Vercel honours root `vercel.json` crons under the Nitro preset: the build output carries them anyway (finding 8). No connected project has a cron yet.
- Whether a Gateway-executed web search (`gateway.tools.exaSearch()`) inside a `WorkflowAgent` model-call step reports its calls in the Gateway's cost; the code path is the documented one, and `costUsd` falls back to `estimateUsd` when nothing is reported.
