// gtm-lib v23
import {
  createClient as createWebClient,
  type Client,
} from "@libsql/client/web";
import { and, eq, getTableColumns, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { drizzle as drizzleWeb } from "drizzle-orm/libsql/web";
import { getRun } from "workflow/api";
import { HookNotFoundError, WorkflowRunFailedError } from "workflow/errors";
import { getDatabaseConfig } from "./db-url";
import { redact } from "./redact";
import {
  enrichmentRuns,
  workflowRuns,
  type WorkflowRunInsert,
  type WorkflowRunRow,
  type WorkflowStatus,
} from "./schema";
import * as schema from "./schema";

type Database = LibSQLDatabase<typeof schema>;
type Runtime = { client: Client; database: Database };

let runtimePromise: Promise<Runtime> | undefined;

// Keep the file client invisible to the Vercel workflow bundler. It is loaded
// only from an installed local project when the configured URL is file:.
const importLocal = new Function(
  "specifier",
  "return import(specifier)",
) as <T>(specifier: string) => Promise<T>;

async function getClient(): Promise<Client> {
  return (await getRuntime()).client;
}

async function getRuntime(): Promise<Runtime> {
  if (process.env.GTM_PROVIDER_MODE === "fixture") throw new Error("Fixture row checks cannot access the database");
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const config = getDatabaseConfig();
      if (config.dialect === "sqlite") {
        const [{ createClient }, { drizzle }] = await Promise.all([
          importLocal<typeof import("@libsql/client")>("@libsql/client"),
          importLocal<typeof import("drizzle-orm/libsql")>("drizzle-orm/libsql"),
        ]);
        const client = createClient({ url: config.url });
        await client.execute("PRAGMA journal_mode=WAL");
        await client.execute("PRAGMA busy_timeout=5000");
        return {
          client,
          database: drizzle(client, { schema }) as Database,
        };
      }
      const client = createWebClient({
        url: config.url,
        authToken: config.authToken,
      });
      return {
        client,
        database: drizzleWeb(client, { schema }),
      };
    })();
  }
  return runtimePromise;
}

export async function getDb(): Promise<Database> {
  if (process.env.GTM_PROVIDER_MODE === "fixture") throw new Error("Fixture row checks cannot access the database");
  return (await getRuntime()).database;
}

export async function upsertRows(
  table: any,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const columns = getTableColumns(table) as Record<string, any>;
  const key = columns.key;
  if (!key) throw new Error("A workflow table must declare a key column.");
  if (!columns.updatedAt) {
    throw new Error("A workflow table must declare an updated_at column.");
  }

  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const properties = Object.keys(row)
      .filter((property) => property in columns)
      .sort();
    if (!properties.includes("key")) throw new Error("Every upsert row must include key.");
    if (!properties.includes("updatedAt")) {
      throw new Error("Every upsert row must include updatedAt.");
    }
    const signature = properties.join("\u0000");
    groups.set(signature, [...(groups.get(signature) ?? []), row]);
  }

  const db = await getDb();
  for (const [signature, group] of groups) {
    const properties = signature.split("\u0000");
    const set = Object.fromEntries(
      properties
        .filter((property) => property !== "key")
        .map((property) => {
          const column = columns[property];
          return [property, sql.raw(`excluded."${column.name.replaceAll('"', '""')}"`)];
        }),
    );
    const chunkSize = Math.max(1, Math.floor(900 / properties.length));
    for (let index = 0; index < group.length; index += chunkSize) {
      await db
        .insert(table)
        .values(group.slice(index, index + chunkSize))
        .onConflictDoUpdate({ target: key, set });
    }
  }
  return rows.length;
}

export async function insertRun(row: WorkflowRunInsert): Promise<void> {
  const db = await getDb();
  await db.insert(workflowRuns).values(row);
}

export async function updateRunPlain(
  runKey: string,
  patch: Partial<Omit<WorkflowRunInsert, "runKey">>,
): Promise<void> {
  const db = await getDb();
  const safePatch = {
    ...patch,
    ...(patch.error !== undefined && patch.error !== null
      ? { error: redact(patch.error) }
      : {}),
  };
  await db.update(workflowRuns).set(safePatch).where(eq(workflowRuns.runKey, runKey));
}

export async function findLiveRun(
  path: string,
  inputHash: string,
): Promise<WorkflowRunRow | undefined> {
  const db = await getDb();
  return (
    await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.path, path),
          eq(workflowRuns.inputHash, inputHash),
          sql`${workflowRuns.finishedAt} IS NULL`,
        ),
      )
      .limit(1)
  )[0];
}

export async function findScheduledRun(
  path: string,
  scheduledFor: string,
): Promise<WorkflowRunRow | undefined> {
  const db = await getDb();
  return (
    await db
      .select()
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.path, path),
          eq(workflowRuns.scheduledFor, scheduledFor),
        ),
      )
      .limit(1)
  )[0];
}

export async function getRunRow(
  identifier: string,
): Promise<WorkflowRunRow | undefined> {
  const db = await getDb();
  return (
    await db
      .select()
      .from(workflowRuns)
      .where(
        or(
          eq(workflowRuns.runKey, identifier),
          eq(workflowRuns.runId, identifier),
        ),
      )
      .limit(1)
  )[0];
}

/** A batch parent has one level of ordinary row-workflow children. */
export function runLedgerCondition(runKey: string) {
  return sql`(${enrichmentRuns.runKey} = ${runKey} OR ${enrichmentRuns.runKey} IN
    (SELECT run_key FROM workflow_runs WHERE parent_run_key = ${runKey}))`;
}

export async function getChildRuns(runKey: string): Promise<WorkflowRunRow[]> {
  return (await getDb()).select().from(workflowRuns)
    .where(eq(workflowRuns.parentRunKey, runKey)).orderBy(workflowRuns.runKey);
}

export async function notifyBatchParent(row: WorkflowRunRow): Promise<void> {
  if (!row.parentRunKey || row.finishedAt === null) return;
  const { batchCompletionHook } = await import("./approve");
  await batchCompletionHook.resume(`${row.parentRunKey}.batch.${row.runKey}`, { runKey: row.runKey })
    .catch((error) => { if (!HookNotFoundError.is(error)) throw error; });
}

/** Mark authority revoked before cancelling runtime work, including every child. */
export async function cancelRunTree(runKey: string, reason: string | null): Promise<void> {
  const row = await getRunRow(runKey);
  if (!row) throw new Error(`Unknown run ${runKey}`);
  if (row.finishedAt === null) await updateRunPlain(runKey, {
    status: "cancelling", stopReason: reason ?? "operator_cancelled", cancelRequestedAt: Date.now(),
  });
  for (const child of await getChildRuns(runKey)) {
    if (child.finishedAt === null) await cancelRunTree(child.runKey, reason);
  }
  if (row.finishedAt !== null) return;
  const { cancellationHook } = await import("./approve");
  await cancellationHook.resume(`${row.workflow}.${row.runKey}.cancel`, { reason })
    .catch((error) => { if (!HookNotFoundError.is(error)) throw error; });
  if (row.runId) {
    const run = getRun(row.runId);
    if (await run.exists) await run.cancel(reason === null ? undefined : { cancelReason: reason });
  }
}

export async function getRunCostSources(runKey: string) {
  const db = await getDb();
  return db
    .select({
      source: enrichmentRuns.costSource,
      calls: sql<number>`count(*)`,
      costUsd: sql<number>`coalesce(sum(${enrichmentRuns.costUsd}), 0)`,
    })
    .from(enrichmentRuns)
    .where(runLedgerCondition(runKey))
    .groupBy(enrichmentRuns.costSource);
}

export type RunLedgerSummary = {
  success: number;
  empty: number;
  failed: number;
  cacheHits: number;
  pending: number;
  lost: number;
  activeStep: string | null;
  costSources: { source: string; calls: number; costUsd: number }[];
};

export async function getRunLedgerSummary(runKey: string): Promise<RunLedgerSummary> {
  const db = await getDb();
  const rows = await db
    .select({
      rowKey: enrichmentRuns.rowKey,
      step: enrichmentRuns.step,
      status: enrichmentRuns.status,
      source: enrichmentRuns.costSource,
      costUsd: enrichmentRuns.costUsd,
    })
    .from(enrichmentRuns)
    .where(runLedgerCondition(runKey));

  const keyed = new Map<string, Set<string>>();
  const unkeyed: Record<string, number> = {};
  const costSources = new Map<string, { calls: number; costUsd: number }>();
  let cacheHits = 0;
  let pending = 0;
  let lost = 0;
  let activeStep: string | null = null;
  for (const row of rows) {
    if (row.rowKey) {
      const statuses = keyed.get(row.rowKey) ?? new Set<string>();
      statuses.add(row.status);
      keyed.set(row.rowKey, statuses);
    } else {
      unkeyed[row.status] = (unkeyed[row.status] ?? 0) + 1;
    }
    if (row.status === "cache_hit") cacheHits += 1;
    if (row.status === "pending") {
      pending += 1;
      activeStep ??= row.step;
    }
    if (row.status === "lost") lost += 1;
    const source = costSources.get(row.source) ?? { calls: 0, costUsd: 0 };
    source.calls += 1;
    source.costUsd += Number(row.costUsd ?? 0);
    costSources.set(row.source, source);
  }

  let success = 0;
  let empty = 0;
  let failed = 0;
  for (const statuses of keyed.values()) {
    if (statuses.has("error") || statuses.has("lost")) failed += 1;
    else if (statuses.has("success") || statuses.has("cache_hit")) success += 1;
    else if (statuses.has("empty")) empty += 1;
  }
  success += (unkeyed.success ?? 0) + (unkeyed.cache_hit ?? 0);
  empty += unkeyed.empty ?? 0;
  failed += (unkeyed.error ?? 0) + (unkeyed.lost ?? 0);

  return {
    success,
    empty,
    failed,
    cacheHits,
    pending,
    lost,
    activeStep,
    costSources: [...costSources]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, values]) => ({ source, ...values })),
  };
}

export async function reconcileRun(runKey: string): Promise<WorkflowRunRow> {
  let row = await getRunRow(runKey);
  if (!row) throw new Error(`Unknown run ${runKey}`);
  if (
    row.finishedAt !== null ||
    !["running", "waiting", "cancelling"].includes(row.status)
  ) {
    return row;
  }

  const now = Date.now();
  const children = await getChildRuns(runKey);
  if (children.length) {
    const reconciled = [];
    for (const child of children) reconciled.push(await reconcileRun(child.runKey));
    const cost = await getRunCostSources(runKey);
    const startedKeys = new Set(children.flatMap((child) => (JSON.parse(child.input).rows as { key: string }[]).map((row) => row.key)));
    const unstartedKeys = (JSON.parse(row.input).rows as { key: string }[]).filter((row) => !startedKeys.has(row.key)).map((row) => row.key);
    await updateRunPlain(runKey, {
      completed: reconciled.reduce((sum, child) => sum + (child.completed ?? 0), 0),
      failed: reconciled.reduce((sum, child) => sum + (child.failed ?? 0), 0),
      costUsd: cost.reduce((sum, item) => sum + Number(item.costUsd), 0),
      remainingKeys: JSON.stringify([...reconciled.flatMap((child) => child.remainingKeys ? JSON.parse(child.remainingKeys) : []), ...unstartedKeys]),
    });
    if (row.status === "cancelling" && reconciled.some((child) => child.finishedAt === null)) return (await getRunRow(runKey))!;
  }
  if (!row.runId) {
    if (now - row.startedAt < 10 * 60_000) return row;
    row = (await getRunRow(runKey))!;
    if (row.runId || row.finishedAt !== null) return row;
    await finishRun(runKey, {
      status: "failed",
      error: "start not recorded",
      finishedAt: now,
    });
    return (await getRunRow(runKey))!;
  }

  const run = getRun(row.runId);
  if (!(await run.exists)) {
    await finishRun(runKey, {
      status: "failed",
      error: "run state expired",
      finishedAt: now,
    });
    return (await getRunRow(runKey))!;
  }

  const sdkStatus = await run.status;
  if (
    ["completed", "failed", "cancelled"].includes(sdkStatus) &&
    row.status === "cancelling" &&
    (await hasPendingRunCalls(runKey)) &&
    (row.cancelRequestedAt === null || now - row.cancelRequestedAt < 6 * 60_000)
  ) {
    return row;
  }
  const status: WorkflowStatus | undefined =
    row.status === "cancelling" &&
    ["completed", "failed", "cancelled"].includes(sdkStatus)
      ? row.stopReason === "parent_deadline" ? "timed_out" : row.stopReason === "parent_failed" ? "failed" : "cancelled"
      : sdkStatus === "completed"
      ? "completed"
      : sdkStatus === "failed"
        ? "failed"
        : sdkStatus === "cancelled"
          ? "cancelled"
          : undefined;
  if (!status) return row;

  let error: string | undefined;
  let failedStep: string | undefined;
  if (status === "failed") {
    try {
      await run.returnValue;
    } catch (caught) {
      const cause = WorkflowRunFailedError.is(caught) ? caught.cause : caught;
      error = redact(cause);
      failedStep = inferFailedStep(cause);
    }
  }
  await finishRun(runKey, {
    status,
    ...(error ? { error } : {}),
    ...(failedStep ? { failedStep } : {}),
    finishedAt: now,
  });
  return (await getRunRow(runKey))!;
}

async function hasPendingRunCalls(runKey: string): Promise<boolean> {
  const db = await getDb();
  return Boolean(
    (
      await db
        .select({ id: enrichmentRuns.id })
        .from(enrichmentRuns)
        .where(
          and(
            eq(enrichmentRuns.runKey, runKey),
            eq(enrichmentRuns.status, "pending"),
          ),
        )
        .limit(1)
    )[0],
  );
}

async function finishRun(
  runKey: string,
  patch: Partial<Omit<WorkflowRunInsert, "runKey">>,
) {
  const db = await getDb();
  await db
    .update(enrichmentRuns)
    .set({
      status: "lost",
      errorKind: "lost",
      error: "paid call outcome unavailable after terminal run",
    })
    .where(
      and(
        eq(enrichmentRuns.runKey, runKey),
        eq(enrichmentRuns.status, "pending"),
      ),
    );
  const cost = (
    await db
      .select({ costUsd: sql<number>`coalesce(sum(${enrichmentRuns.costUsd}), 0)` })
      .from(enrichmentRuns)
      .where(runLedgerCondition(runKey))
  )[0];
  await updateRunPlain(runKey, { ...patch, costUsd: Number(cost?.costUsd ?? 0) });
  await notifyBatchParent((await getRunRow(runKey))!);
}

function inferFailedStep(cause: unknown): string | undefined {
  if (cause && typeof cause === "object") {
    const named = (cause as { stepName?: unknown }).stepName;
    if (typeof named === "string" && named) return named;
    const stack = (cause as { stack?: unknown }).stack;
    if (typeof stack === "string") {
      const match = stack.match(/\bat\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (match && match[1] !== "Error") return match[1];
    }
  }
  return undefined;
}

export function assertReadOnlyQuery(query: string): string {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  const visible = maskSqlLiteralsAndComments(trimmed);
  if (!/^\s*(select|with)\b/i.test(visible) || visible.includes(";")) {
    throw new Error("query accepts one read-only SELECT statement");
  }
  const forbidden = [
    "delete",
    "update",
    "insert",
    "replace",
    "drop",
    "alter",
    "create",
    "attach",
    "detach",
    "pragma",
    "vacuum",
    "reindex",
  ];
  const match = visible.match(new RegExp(`\\b(${forbidden.join("|")})\\b`, "i"));
  if (match) throw new Error(`query is read-only; ${match[1].toUpperCase()} is not allowed`);
  return trimmed;
}

/**
 * Runs a SELECT the library itself composed. It leaves PRAGMA query_only alone, so a read served
 * from the same process as a running workflow cannot make that workflow's writes fail.
 */
export async function executeSelect(query: string): Promise<Record<string, unknown>[]> {
  const client = await getClient();
  const result = await client.execute(assertReadOnlyQuery(query));
  return result.rows.map((row) => ({ ...row }));
}

export async function executeReadOnly(query: string): Promise<Record<string, unknown>[]> {
  const statement = assertReadOnlyQuery(query);
  const client = await getClient();
  // The pragma sandboxes a caller-supplied statement, but it is per connection and the connection
  // is shared, so it is always cleared again: a sticky query_only fails every later write.
  const guarded = getDatabaseConfig().dialect === "sqlite";
  if (guarded) await client.execute("PRAGMA query_only=1");
  try {
    const result = await client.execute(statement);
    return result.rows.map((row) => ({ ...row }));
  } finally {
    if (guarded) await client.execute("PRAGMA query_only=0");
  }
}

function maskSqlLiteralsAndComments(sqlText: string): string {
  let result = "";
  let index = 0;
  while (index < sqlText.length) {
    const current = sqlText[index];
    const next = sqlText[index + 1];
    if (current === "-" && next === "-") {
      const end = sqlText.indexOf("\n", index + 2);
      const length = (end < 0 ? sqlText.length : end) - index;
      result += " ".repeat(length);
      index += length;
      continue;
    }
    if (current === "/" && next === "*") {
      const end = sqlText.indexOf("*/", index + 2);
      const length = (end < 0 ? sqlText.length : end + 2) - index;
      result += " ".repeat(length);
      index += length;
      continue;
    }
    if (["'", '"', "`"].includes(current)) {
      const quote = current;
      result += " ";
      index += 1;
      while (index < sqlText.length) {
        result += " ";
        if (sqlText[index] === quote) {
          if (sqlText[index + 1] === quote) {
            result += " ";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    result += current;
    index += 1;
  }
  return result;
}
