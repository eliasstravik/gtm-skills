# GTM workflow contract

Use this contract for every workflow action.

For stage selection, agent tools/skills, native workflow composition, and extension requirements, read [workflow composition](capabilities.md). For permanent event intake and standing authorization, read [event sources](events.md).

## Workspace and ownership

Resolve the workspace in this order: a repository named in the request, the connected repository, then canonical repositories under `~/.gtm/` whose root has `ORG.md`. If several remain, ask which one to use. If none exists, stop before writes and hand creation or connection to `gtm-workspace`.

A named organization node wins. Otherwise use root unless the workflow belongs to exactly one suborganization. The project always lives at workspace root. Root workflows use `workflows/workflows/<slug>.ts`; suborganization paths omit physical `suborgs/` segments. Once resolved, place the context line `Using GTM workspace: <root display name>` under the bold opener of every proposal and grouped question; on a hosted surface the approval text opens `For <root display name>:` instead. Workflow counts are internal.

## Project shape and state

```text
workflows/
├── package.json, nitro.config.ts, drizzle.config.ts
├── drizzle/
├── workflows/<owner-path>/<slug>.ts
├── db/tables/<table>.ts
├── providers/<provider>.ts
├── events/index.ts
├── lib/  (versioned runtime, accounting, agents, events, and diagrams)
├── scripts/{gtm,migrate-cloud,verify-migrations}.ts
└── server/api/{deployment,run,runs,runs/[runId]/{cancel,trigger},approve}/...
```

Git owns definitions, typed tables, adapters, and migrations. Vercel owns retained execution state, attempts, graphs, and logs. The database owns business rows, the paid-call cache and ledger, and the durable run index. Source can roll back; schema and data do not. The fixed tables are `enrichment_cache`, `enrichment_runs`, and `workflow_runs`; each workflow declares its own result table.

Ignore `node_modules/`, `.env*` except `.env.example`, `.vercel/`, `.well-known/`, `.workflow-data/`, `.nitro/`, `.output/`, `.swc/`, and `data/`. Track `drizzle/`.

## Versioned files

Every `lib/*.ts`, API route, page route under `server/routes`, managed script, `drizzle.config.ts`, and `nitro.config.ts` starts with `// gtm-lib v20`. `package.json` carries `gtm.libVersion: 20`, SHA-256 entries under `gtm.libHashes`, and pinned versions under `gtm.validatedAgainst`. Run `gtm check` before every action: distinguish an old header from a locally modified hash, show the diff of a modified managed file before offering a recopy, and never overwrite it silently.

Follow the [runtime upgrade procedure](../../../docs/runtime-upgrade.md) before changing a validated pin.

A v2 project has no fixed schema or migrations; offer a v18 re-scaffold through update, preserve ignored results, present the full diff, and migrate after acceptance. A v5 project lacks cancellation. A v6 project combines web research and structured answering incorrectly. A v8 project cannot preserve original provider responses and does not trust the ledger for totals. Offer the v18 recopy and its committed fixed-table migration.

A v9 project lets cloud queries reuse the write credential and accepts data-changing CTEs. A v9 project cannot guarantee `tools: "none"` on every local model backend. A v9 cancellation closes the run row before the runtime confirms its in-flight step stopped. A v9 route can lose the SDK run id and reopen the duplicate guard while an orphan is live. A v9 model cache ignores accepted ICP and persona content. A v9 project can persist and return credentials embedded in errors. A v9 ledger starts after the paid call and cannot distinguish reported, fixed, and projected costs. A v9 command allowlist can preapprove real spend and mutation. A v9 approval route duplicates hook schema, uses an internal import, and leaves decided hooks reusable. <!-- TEMPORARY: waits on workflow@5.0.0: keep recovery disabled until restart cannot re-enqueue a pending paid step. --> A v9 local restart can recover and repeat a paid step before the documented zombie procedure runs. A v9 production route accepts starts that do not prove the workspace commit. Offer the v18 recopy through update, show every locally modified managed-file diff, and apply its committed migration with `db:migrate` and `db:verify`.

A v10 project lacks provider discovery, bounded operator polling, row and step ledger attribution, selective reruns, command-generated diagrams, and receipt summaries. Offer the v18 recopy and its committed ledger migration through update.

A v11 project's `gtm check` misreads template literals and regular expressions inside function bodies, so a workflow whose steps use `${...}` before the exported workflow fails with a false `invalid_export`. Offer the v18 recopy; no schema change is required.

A v12 project's `gtm check` rejects every destructive migration, including one already accepted through the delete flow, so a project cannot keep an accepted drop and pass its own check. Offer the v18 recopy; no schema change is required.

A v13 project has no workflow graph, no signed diagram page, no PNG rendering, no stage attributes, and its `gtm check` accepts unlabelled or hidden steps. Its workflows fail the v18 `diagram_rules` check until every step carries a label and every step call sits in the workflow body. Offer the v18 recopy through update, apply the listed fixes to each workflow in the same proposal, and confirm the shape with the ASCII diagram; no schema change is required.

A v14 project cannot serve its diagram routes on Vercel, because the build inlines the CommonJS TypeScript parser into the ESM function bundle and every diagram request fails with `__filename is not defined`. A v14 project also cannot run remote read-only commands in the hosted sandbox, where no read-only token is present; its diagram cannot see inside a row helper, so it forces the helper into one opaque step; and it reads only a `Table:` header, so a workflow whose header says `Result table:` shows no table. Offer the v18 recopy through update; no schema change is required.

A v15 project passes the WASM-only `fontBuffers` option to the native PNG renderer, so deployed images lose their text. Offer the v18 recopy; no schema change is required.

The v18 template pins runtime beta.46. It accepts the lazy hook-resume timing and ended-run behavior because approval state is checked in the database before every resume. The release also retains workflow VMs across attribute writes and safe boundaries with open hooks. The recovery, embedded data-directory, and engine-ceiling workarounds remain until stable 5.0.0 triggers the next review.

A v16 project lacks durable agent definitions, selected MCP/HTTP tools and committed skills, atomic agent-call reservations, capability previews, and permanent signed event intake. Recopy v18 through update and preserve existing workflow-owned files. Add the empty workflow-owned `events/index.ts` only when absent; never replace a configured registry. No schema migration is required. The added packages and their compatibility are recorded in [composition](capabilities.md#extension-boundary).

The pinned WorkflowAgent's `timeout` option calls `AbortSignal.timeout()` in workflow context, which beta.46 rejects. The managed helper instead uses a durable `sleep()` and cancellation signal. The model/MCP fixtures cover the resulting workflow path. Recheck this behavior on the next WorkflowAgent upgrade; do not substitute a real timer in orchestration code.

## Workflow and table contract

Use a lowercase kebab-case filename and export its camelCase basename. Row workflows carry purpose, run location, kind, schedule when applicable, owner, ICP, providers with accepted unit cost, result table, and key meaning in the file header. Export `input`, `MAX_ROWS`, `MAX_SPEND_USD`, `COST_PER_ROW_USD`, the workflow function, and `scheduledInput` for scheduled work. The workflow takes `(arg: Input, meta: WorkflowMeta)` and assigns `arg = input.parse(arg)` immediately after `"use workflow"`; scheduled work sets `arg ??= scheduledInput` first.

Declare each result table in `db/tables/<snake_case>.ts` with `key: text("key").primaryKey()` and `updatedAt: integer("updated_at").notNull()`. New columns are nullable or defaulted. `upsertRows()` updates only properties present in each row, so disjoint enrichments do not erase each other. Derive model-facing business fields with `createInsertSchema(table).pick(...)` inside the paid step, then add `key` and `updatedAt` in the save step.

Use this shape and keep business names specific:

```ts
// db/tables/accounts.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  key: text("key").primaryKey(), score: integer("score"), reason: text("reason"),
  updatedAt: integer("updated_at").notNull(),
});
```

```ts
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { accounts } from "../db/tables/accounts";
import { agent } from "../lib/agent";
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { runRows } from "../lib/rows";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 100, MAX_SPEND_USD = 10, COST_PER_ROW_USD = 0.1;
const acceptedIcp = "<resolved accepted ICP and persona text>";
/** Enrich the account */
async function enrichAccount(row: Input["rows"][number], meta: WorkflowMeta, signal: AbortSignal) {
  "use step";
  const schema = createInsertSchema(accounts).pick({ score: true, reason: true });
  const value = await agent({ prompt: `Score ${row.domain}.`, context: acceptedIcp,
    contextId: "icps/accepted.md", schema, tools: "none", maxUsd: COST_PER_ROW_USD, meta, signal });
  return { key: row.key, value };
}
enrichAccount.maxRetries = 0;
/** Save the account */
async function saveAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]);
}
export async function findAccounts(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveAccount },
    rowStep: enrichAccount, caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD,
      costPerRowUsd: COST_PER_ROW_USD } });
}
```

`runRows()` owns cap-before-spend, ledger-based mid-run caps, per-row isolation, save-before-checkpoint, success/empty/failed counts, held-run stops, remaining keys, terminal status, and cost bookkeeping.

## Runtime and run identity

`POST /api/run/<path>` starts explicit input. `GET /api/run/<path>` starts `scheduledInput`. The route inserts a random run key and stable input hash before `start()`. A partial unique index on `(path, input_hash)` while `finished_at` is null admits one live matching run.

The workflow's first library step self-registers the SDK run id and run URL; the route writes the same id best-effort and attaches searchable run-key, workflow, commit, and checkpoint attributes at start. On conflict, reconcile once and retry one insert. A row still missing `run_id` after ten minutes is re-read before it can become `failed` with `start not recorded`.

<!-- TEMPORARY: waits on workflow@5.0.0: remove the recovery override after restart cannot re-enqueue a pending paid step. -->
Local development sets `WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS=0`, so restart does not re-enqueue a pending paid step. For a zombie `running`, `waiting`, or `cancelling` row, run `npx workflow cancel <runId>`, then `npm run gtm -- runs get <runKey>`.

`GET /api/runs/<runId|runKey>` reconciles active rows and returns the durable row, ledger summary, cost sources, remaining keys, failed step, run URL, and SDK result while retained. `gtm runs get --wait <seconds>` stops at the bound and marks a live result `still_active`; `--format markdown` produces the relay-ready receipt and `--failed` joins redacted failed calls to their row and step. Approval and trigger routes are bearer-protected and resume exported typed hooks. Approval rejects stale decisions with `409 approval_not_pending`; denial ends `stopped`, timeout ends `timed_out`, and resolved hooks are disposed.

Cancellation first records non-terminal `cancelling` without `finished_at`, requests SDK cancellation, and signals an in-flight adapter when it honors `AbortSignal`. The live index stays closed until reconciliation sees SDK `cancelled`; saved rows and prior spend remain.

When `VERCEL_GIT_COMMIT_SHA` exists, production POST starts require `x-gtm-workspace-head`: absence returns `deployment_head_required`, mismatch returns `deployment_not_ready`. The laptop CLI sends clean, pushed `origin/main` automatically for the recorded production URL and refuses dirty or unpushed work.

Scheduled starts persist the UTC `scheduled_for` date under a unique `(path, scheduled_for)` index, so a second delivery returns `already_ran_today` after or during the first run. Recover a missed day with reviewed `scheduledInput` and `--scheduled-for YYYY-MM-DD`; deduplicate downstream delivery by that date. Triggered row handlers skip a key whose `updated_at` is newer than the trigger event.

Subdaily cron routes can opt into fixed UTC admission windows through `cadence-minutes`; see [event sources](events.md). Permanent signed intake stores an event identity in the same index so completed events remain deduplicated.

The platform documentation states that retained run state lasts one day, seven days, or thirty days by plan; the database remains the durable record. A start body is practically limited by the platform's 4.5 MB function request cap. A run is limited to 25,000 events and 10,000 steps, with replay slowing beyond roughly 2,000 events, so split inputs above about 300 rows into child workflows by batch and attach the parent run id as an attribute.

## Paid calls

Classic paid calls use `provider()` and short model calls use `agent()` inside an operator-named step. Durable agents and custom accounted adapters follow [the agent accounting contract](capabilities.md#limits-and-accounting). `runRows()` passes row and step identities into calls; the ledger stores them as `row_key` and `step`. Before a classic cache-miss call, the library writes `pending`; afterward it atomically writes the cache and updates the ledger to `success`, `empty`, or `error`. Terminal reconciliation turns abandoned pending rows into `lost`. Cache hits cost zero, cache parse failures record `error`, and pre-call failures cost zero. `cost_source` distinguishes `reported`, `fixed`, and `projected`; totals include pending and lost reservations.

Adapter inputs are canonical and contain no credential. Pass accepted ICP and persona text to `agent({ context, contextId })`; both affect its cache key. For untrusted row or provider content, `claude` and `api` enforce `tools: "none"`; other local backends must fail before spawn unless the operator explicitly accepts `tools: "host-default"`. Paid steps set `maxRetries = 0`; bounded retries may rethrow only `RetryableError` after confirming the attempt was not billed. See [providers](providers.md).

## Environment

Absent `TURSO_DATABASE_URL` selects `file:./data/gtm.db`; empty tokens mean absent. `.env.local` is forbidden because Nitro could point local runs at the cloud database while local commands use the file. `GTM_SANDBOX=1` requires a remote database and `GTM_AGENT_BACKEND=api`; the sandbox authors, validates, dry-runs, and queries with read-only authority but starts no real run.

## House rules

| Rule | Required behavior |
| --- | --- |
| Business stages define the graph | Use a named ordinary step or a declared managed agent stage for each operator stage. |
| Steps carry labels | Every `"use step"` function has a JSDoc comment whose first line is a 3 to 80 character plain-language label; it is the card text on every diagram. `gtm check`: `step_label_missing`. |
| Steps stay visible | Business steps are called from workflow context or a visible helper. Managed `durableAgent()` is a dynamic business stage whose inner model/tool steps are visible in native traces. Keep its loop outside a step. `gtm check`: `step_hidden_in_helper`, `step_unreachable`, `agent_boundary`. |
| Paths are visible | A branch or loop that changes the path is an `if`, `for`, or `Promise.all` in the workflow body on step results, never a condition inside a step. A `//` comment on the line above names the decision or loop. |
| Stages mark the timeline | The workflow calls `setAttributes({ stage })` at each stage; `runRows()` does this for row work. `gtm check`: `stage_attributes_missing`. |
| Reachability controls bundles | Workflow and module-scope executable code use only the allowed workflow helpers and local steps. |
| Rows have identity | Every result row has a stable `key`; reruns merge by it. |
| Tables are declared | Schema changes use table files and committed migrations, never runtime DDL. |
| Paid calls are accounted | Use `provider()`/`agent()` inside paid steps, `durableAgent()` in workflow context, or an adapter using the reservation ledger. Each paid/effectful attempt has its own identity and retry policy. |
| Row bookkeeping is centralized | Use `runRows()`; non-row workflows end with `updateRun()`. |
| Scheduled delivery deduplicates | Use `scheduled_for`, never the SDK run id, as the delivery key. |

`gtm check` uses the TypeScript compiler API to enforce paid-step retry policy, table keys and timestamps, deterministic workflow bodies, terminal bookkeeping, and allowed module-scope execution. It also validates migrations, managed-file headers and hashes, and warns when installed runtime versions differ from the validated pins. It also extracts the workflow graph and reports every diagram rule finding in one diagram_rules error, one line per finding with its fix.

## Safety and persistence

Generate migrations with `npm run db:generate`, optionally `-- --name <slug>` or `-- --custom --name <slug>` for a data-only migration. The helper stages SQL, journal, and snapshot together, installs them only on confirmed success, and terminates generation after 60 seconds. It never connects to the database to apply a migration. Keep its command binding when updating an existing project.

For `migration_input_required`, inspect the listed added and removed tables, views, or columns against the intended change and the previous snapshot. Unrelated fixed tables in that list indicate snapshot drift: resolve that discrepancy before generating a deletion. For independent additions/removals, generate the additions while retaining the old objects, then generate the separately reviewed removal. For renames, use the expand/contract sequence below. Ask the user only when data retention or intended behavior is unresolved. Retry only after that cause is resolved; use no pseudo-terminal or guessed keystrokes to force generation through a prompt. A custom migration is for reviewed data SQL, never a substitute for a schema snapshot.

On `migration_timeout` or an agent command timeout, tell the user what stopped. Recheck any effects before continuing. The migration helper leaves the original artifacts intact on a generator failure; a generic command can have partial effects. A `migration_busy` result requires checking the existing generator before removing its stale lock. If interruption left `.gtm-migration-*` recovery directories, inspect them before cleanup; never delete the sole surviving migration history.

Run `gtm run --dry-run` before every real run. It imports the workflow without starting it, validates the exported Zod input, counts only parsed `rows`, and checks caps; it does not check table existence or credentials. Gate the real run with rows, stages, projected cost, caps, external writes, and checkpoint position.

Use committed migrations only. `gtm check` rejects orphan artifacts and flags `DELETE`, `UPDATE`, `RENAME`, `DROP`, and `CREATE TRIGGER` for explicit destructive review. A destructive migration passes `gtm check` only when its first line is `-- gtm: destructive accepted`, added after the separate destructive choice is accepted; the hosted save still declares it destructive in the approval request. Use expand/contract for renames: add a compatible column, backfill in a separately reviewed migration, switch code, and drop only after the old deployment is gone. State anything beyond additive `CREATE TABLE` or `ADD COLUMN` in words in the proposal, naming the table or column and the rows affected, and show its SQL on request; apply with `db:migrate`, and run `db:verify`; nothing migrates as a build side effect.

Secrets stay out of prompts, tracked files, step input and output, ledgers, comments, and command output; the library defensively redacts error paths. If a user pastes a credential into the conversation, treat it as compromised: help rotate it and store the replacement through the environment. Approval and trigger tokens only name a pending stage; the route bearer authorizes the action. A public per-run webhook URL remains a capability and must not be shared.

A v17 project lacks compiled workflow initialization checks and a delivery callback before row-run completion. Recopy v18 through update, preserve workflow-owned files, and append `node scripts/check-workflow-runtime.mjs` after `nitro build` in any customized build command. Move post-save delivery into `runRows.afterSave`. No schema migration is required.

A v19 project can block on an interactive migration prompt. Recopy v20 through update, set `db:generate` to `node scripts/generate-migration.mjs`, and ignore `.gtm-migration-*/` staging directories. Preserve workflow-owned files and existing migration history. No schema migration is required.
