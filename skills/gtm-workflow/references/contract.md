# GTM workflow contract

Use this contract for every workflow action.

## Contents

- [Workspace and ownership](#workspace-and-ownership)
- [Project shape and state](#project-shape-and-state)
- [Versioned files](#versioned-files)
- [Workflow and table contract](#workflow-and-table-contract)
- [Runtime and run identity](#runtime-and-run-identity)
- [Paid calls](#paid-calls)
- [Environment](#environment)
- [House rules](#house-rules)
- [Safety and persistence](#safety-and-persistence)

## Workspace and ownership

Resolve the workspace in this order: a repository named in the request, the connected repository, then canonical repositories under `~/.gtm/` whose root has `ORG.md`. If several remain, ask which one to use and list its display name and path. If none exists, stop before writes and hand creation or connection to `gtm-workspace`.

A named organization node wins. Otherwise use root unless the workflow belongs to exactly one suborganization. The project always lives at workspace root. Root workflows use `workflows/workflows/<slug>.ts`. Suborganization workflows use `workflows/workflows/<suborg-path>/<slug>.ts`, with physical `suborgs/` segments omitted.

Before acting, state `Using GTM workspace: <display name> | <N> workflows visible`.

## Project shape and state

```text
workflows/
├── .env.example
├── package.json
├── package-lock.json
├── nitro.config.ts
├── drizzle.config.ts
├── drizzle/
├── workflows/<owner-path>/<slug>.ts
├── db/tables/<table>.ts
├── providers/<provider>.ts
├── lib/{schema,db-url,db,steps,provider,agent,approve}.ts
├── scripts/gtm.ts
└── server/api/{deployment,run,runs,approve}/...
```

Git owns definitions, table declarations, adapters, and migrations. Vercel owns steps, attempts, retries, graphs, and logs. The database owns business rows, the paid-call cache and ledger, and the run index. The database does not copy a step trace. Source and deployments can roll back. Schema and data do not roll back.

The three fixed tables are `enrichment_cache`, `enrichment_runs`, and `workflow_runs`. A workflow declares its own result table. There is no shared entity or CRM schema.

Ignore `node_modules/`, `.env*` except `.env.example`, `.vercel/`, `.well-known/`, `.workflow-data/`, `.nitro/`, `.output/`, `.swc/`, and `data/`. Track `drizzle/`.

## Versioned files

Every `lib/*.ts`, all four route files, `scripts/gtm.ts`, `drizzle.config.ts`, and `nitro.config.ts` starts with `// gtm-lib v5`. `package.json` carries `gtm.libVersion: 5`. Compare these versions before every action. Name differing files and offer a template recopy in the proposal. Compare headers, not hashes, and never recopy silently.

A v2 project has no `lib/schema.ts` or `drizzle/`. Offer a v5 re-scaffold through update: copy the v5 files, add the pinned dependencies and baseline migrations, migrate, then recreate each workflow through create from its header and purpose. Present the full diff before saving. Keep old ignored JSON results.

## Workflow and table contract

Use a lowercase kebab-case filename and export its camelCase basename. Row-producing workflows have this header:

```ts
/**
 * <One sentence stating the workflow purpose.>
 * Runs: on this computer | on Vercel
 * Kind: on-demand | scheduled | triggered
 * Schedule: <UTC cron expression>              // scheduled only
 * Owner: <organization node> | ICP: <ICP name>
 * Providers: <adapter name + endpoint + row cost, or none>
 * Table: <snake_case table> | key: <what key holds>
 */
```

Export `input`, `MAX_ROWS`, `MAX_SPEND_USD`, `COST_PER_ROW_USD`, the workflow function, and `scheduledInput` for scheduled work. Every workflow accepts `(arg: Input, meta: WorkflowMeta)`. A scheduled workflow puts `arg ??= scheduledInput` directly after `"use workflow"`.

Declare each result table in `db/tables/<snake_case>.ts`. Export one `sqliteTable` whose SQL name matches the basename. It has `key: text("key").primaryKey()` and `updatedAt: integer("updated_at").notNull()`. New columns on an existing table are nullable or defaulted. Input schemas that select existing rows include `key`.

The model-facing schema comes from `createInsertSchema(table).pick(...)` inside the step that calls `agent()`. Ask the model only for business columns of type text, integer, or real. Add `key` and `updatedAt` before `upsertRows()`. A save step writes each successful row before the checkpoint can pause the run.

Use this shape and keep business names specific:

```ts
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { accounts } from "../db/tables/accounts";
import { agent } from "../lib/agent";
import { checkpoint, type WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { updateRun } from "../lib/steps";

export const input = z.object({
  rows: z.array(z.object({ key: z.string(), domain: z.string() })),
});
type Input = z.infer<typeof input>;

export const MAX_ROWS = 100;
export const MAX_SPEND_USD = 10;
export const COST_PER_ROW_USD = 0.1;

async function enrichAccount(row: Input["rows"][number], meta: WorkflowMeta) {
  "use step";
  const rowSchema = createInsertSchema(accounts).pick({ score: true, reason: true });
  try {
    const result = await agent({
      prompt: `Score ${row.domain} against the accepted ICP.`,
      schema: rowSchema,
      tools: "none",
      maxUsd: COST_PER_ROW_USD,
      meta,
    });
    return { ok: true, key: row.key, result, costUsd: COST_PER_ROW_USD } as const;
  } catch (error) {
    return {
      ok: false,
      key: row.key,
      error: String(error),
      costUsd: COST_PER_ROW_USD,
    } as const;
  }
}
enrichAccount.maxRetries = 0;

async function saveAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [row]);
}

export async function findAccounts(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  const projected = arg.rows.length * COST_PER_ROW_USD;
  if (arg.rows.length > MAX_ROWS || projected > MAX_SPEND_USD) {
    throw new Error("Accepted workflow limits exceeded");
  }
  const completed: string[] = [];
  const failed: { key: string; error: string }[] = [];
  let spentUsd = 0;
  for (const row of arg.rows) {
    const outcome = await enrichAccount(row, meta);
    spentUsd += outcome.costUsd;
    if (outcome.ok) {
      await saveAccount({ key: outcome.key, ...outcome.result, updatedAt: Date.now() });
      completed.push(outcome.key);
    } else failed.push({ key: outcome.key, error: outcome.error });
    if (completed.length + failed.length === meta.checkpoint) {
      const decision = await checkpoint(meta, {
        completed: completed.length,
        failed: failed.length,
        spentUsd,
        projectedRemainingUsd:
          (arg.rows.length - completed.length - failed.length) * COST_PER_ROW_USD,
        table: "accounts",
      });
      if (!decision.approved) break;
    }
  }
  await updateRun(meta.runKey, {
    status: "completed",
    completed: completed.length,
    failed: failed.length,
    cost_usd: spentUsd,
    finished: true,
  });
  return { completed, failed };
}
```

## Runtime and run identity

`POST /api/run/<path>` starts explicit input. `GET /api/run/<path>` starts scheduled input with `null` as the first workflow argument. The route creates a random `runKey`, hashes stable JSON input, inserts `workflow_runs`, then calls `start()`. A partial unique index on `(path, input_hash)` while `finished_at` is null admits one live matching run.

On a conflict, reconcile once against the SDK and retry one insert. A live row returns 409 with its run key. A row without `run_id` stays live for 120 seconds, then reconciles to `failed` with `start not recorded`. A missing retained SDK run becomes `failed` with `run state expired`.

If a local restart leaves a zombie row in `running` or `waiting`, run `npx workflow cancel <runId>`, then `npm run gtm -- runs get <runKey>`. This is the only unblock procedure.

`GET /api/runs/<runId|runKey>` reconciles active rows and returns the database row. It includes the SDK result while retained. Approval uses `defineHook`; the bearer-protected approve route calls `resumeHook` directly. A timeout defaults to seven days, records a denial with comment `timeout`, and disposes the hook.

`GET /api/deployment` is bearer-protected and returns the production deployment's `VERCEL_GIT_COMMIT_SHA`. Trusted starts poll it until it matches the accepted workspace commit, then send that commit in `x-gtm-workspace-head`. The POST run route returns `409 deployment_not_ready` when production is not serving that exact commit.

## Paid calls

Every paid vendor call goes through `provider()` inside an operator-named step. Every model call goes through `agent()`, which uses the same cache and ledger. Each call writes one `enrichment_runs` row. Cache hits cost zero. A backend that reports no model cost records the accepted `maxUsd` projection.

Adapter input is canonical and visible in the cache, so it contains no credential. Paid steps set `maxRetries = 0`. A step may use bounded retries only when it catches every other error and rethrows `RetryableError` solely when the provider confirms the failed attempt was not billed.

See [providers](providers.md) before writing or changing an adapter.

## Environment

`TURSO_DATABASE_URL` absent or empty selects `file:./data/gtm.db`; `TURSO_AUTH_TOKEN` empty means absent. A non-file URL selects the Turso dialect. There is no `DATABASE_URL`.

`.env.local` must not exist in `workflows/`. Nitro would load it after `.env` and point local runs at the cloud database while local database commands still used the file. Refuse local start or reuse until it is removed.

`GTM_SANDBOX=1` is the sole sandbox signal. It refuses file URLs, requires `GTM_AGENT_BACKEND=api`, offers no Studio or exposed port, performs no remote Git command, and hands tracked writes to the host approval tool. Use the Turso dashboard, `gtm query`, `gtm runs get`, and Workflow inspect commands for sandbox inspection.

## House rules

| Rule | Required behavior |
| --- | --- |
| Business stages define the graph | Give each operator stage one named `"use step"` function and call it directly from the workflow body. |
| Reachability controls bundles | Workflow-body and module-scope executable code reference only `zod`, `workflow`, `lib/approve`, `lib/steps`, and local step functions. Imports may name drivers, tables, adapters, `agent()`, and `provider()` only when every runtime reference to them stays inside a step body. |
| Rows have identity | Every result row has a stable `key`; reruns upsert by it. |
| Tables are declared | Schema changes are table files plus `db:generate` and `db:migrate`, never runtime DDL. |
| Paid calls use one funnel | Use `provider()` for vendors and `agent()` for models. |
| Caps precede spend | Reject row or projected-cost excess before the first paid step. |
| Rows fail independently | Catch row errors inside the row step and continue. |
| Checkpoints save first | Save the row that reaches the checkpoint before calling `checkpoint()`. |
| Bookkeeping is explicit | Call terminal `updateRun()` before returning. It is the only unnamed lib step. |
| Scheduled delivery deduplicates | Include the SDK run id and UTC date in delivery payloads. |

## Safety and persistence

Run `npm run gtm -- run <slug> --input <file> --dry-run` before every real run. Gate the real run with rows, stages, projected cost, caps, external writes, and checkpoint position. The first real run of new or changed on-demand work uses `--checkpoint 3` unless the user accepts the full scope. Scheduled runs never checkpoint and rely on caps.

Use committed migrations only. A rename uses `npm run db:generate -- --custom --name <rename-name>` and a hand-written `ALTER TABLE ... RENAME` statement. A drop needs the delete gate and a migration. Nothing runs a migration as a build side effect.

Secrets stay out of prompts, tracked files, step input and output, ledgers, comments, and command output. Values move through ignored environment files or shell input. Treat hook tokens and per-run webhook URLs as unsafe to share even though the approve route also requires the bearer.
