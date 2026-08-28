// gtm-lib v10
import {
  createClient as createWebClient,
  type Client,
} from "@libsql/client/web";
import { and, eq, getTableColumns, or, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql/driver-core";
import { drizzle as drizzleWeb } from "drizzle-orm/libsql/web";
import { getRun } from "workflow/api";
import { WorkflowRunFailedError } from "workflow/errors";
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

export async function getRunCostSources(runKey: string) {
  const db = await getDb();
  return db
    .select({
      source: enrichmentRuns.costSource,
      calls: sql<number>`count(*)`,
      costUsd: sql<number>`coalesce(sum(${enrichmentRuns.costUsd}), 0)`,
    })
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.runKey, runKey))
    .groupBy(enrichmentRuns.costSource);
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
      ? "cancelled"
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
      .where(eq(enrichmentRuns.runKey, runKey))
  )[0];
  await updateRunPlain(runKey, { ...patch, costUsd: Number(cost?.costUsd ?? 0) });
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

export async function executeReadOnly(query: string): Promise<Record<string, unknown>[]> {
  const statement = assertReadOnlyQuery(query);
  const client = await getClient();
  if (getDatabaseConfig().dialect === "sqlite") {
    await client.execute("PRAGMA query_only=1");
  }
  const result = await client.execute(statement);
  return result.rows.map((row) => ({ ...row }));
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
