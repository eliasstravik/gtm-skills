// gtm-lib v5
import { createClient, type Client } from "@libsql/client";
import {
  and,
  eq,
  getTableColumns,
  or,
  sql,
} from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getRun } from "workflow/api";
import { getDatabaseConfig } from "./db-url";
import {
  workflowRuns,
  type WorkflowRunInsert,
  type WorkflowRunRow,
  type WorkflowStatus,
} from "./schema";
import * as schema from "./schema";

let clientPromise: Promise<Client> | undefined;
let databasePromise: Promise<LibSQLDatabase<typeof schema>> | undefined;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const config = getDatabaseConfig();
      const client = createClient({
        url: config.url,
        authToken: config.authToken,
      });
      if (config.dialect === "sqlite") {
        await client.execute("PRAGMA journal_mode=WAL");
        await client.execute("PRAGMA busy_timeout=5000");
      }
      return client;
    })();
  }
  return clientPromise;
}

export async function getDb(): Promise<LibSQLDatabase<typeof schema>> {
  databasePromise ??= getClient().then((client) => drizzle(client, { schema }));
  return databasePromise;
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

  const set = Object.fromEntries(
    Object.entries(columns)
      .filter(([property]) => property !== "key")
      .map(([property, column]) => [
        property,
        sql.raw(`excluded."${column.name.replaceAll('"', '""')}"`),
      ]),
  );
  const chunkSize = Math.max(1, Math.floor(900 / Object.keys(columns).length));
  const db = await getDb();
  for (let index = 0; index < rows.length; index += chunkSize) {
    await db
      .insert(table)
      .values(rows.slice(index, index + chunkSize))
      .onConflictDoUpdate({ target: key, set });
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
  await db.update(workflowRuns).set(patch).where(eq(workflowRuns.runKey, runKey));
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

export async function reconcileRun(runKey: string): Promise<WorkflowRunRow> {
  const row = await getRunRow(runKey);
  if (!row) throw new Error(`Unknown run ${runKey}`);
  if (row.finishedAt !== null || !["running", "waiting"].includes(row.status)) {
    return row;
  }

  const now = Date.now();
  if (!row.runId) {
    if (now - row.startedAt < 120_000) return row;
    await updateRunPlain(runKey, {
      status: "failed",
      error: "start not recorded",
      finishedAt: now,
    });
    return (await getRunRow(runKey))!;
  }

  const run = getRun(row.runId);
  if (!(await run.exists)) {
    await updateRunPlain(runKey, {
      status: "failed",
      error: "run state expired",
      finishedAt: now,
    });
    return (await getRunRow(runKey))!;
  }

  const sdkStatus = await run.status;
  const status: WorkflowStatus | undefined =
    sdkStatus === "completed"
      ? "completed"
      : sdkStatus === "failed"
        ? "failed"
        : sdkStatus === "cancelled"
          ? "cancelled"
          : undefined;
  if (status) {
    await updateRunPlain(runKey, { status, finishedAt: now });
    return (await getRunRow(runKey))!;
  }
  return row;
}

export async function executeReadOnly(query: string): Promise<Record<string, unknown>[]> {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  if (!/^(select|with)\b/i.test(trimmed) || trimmed.includes(";")) {
    throw new Error("query accepts one read-only SELECT statement");
  }
  const client = await getClient();
  if (getDatabaseConfig().dialect === "sqlite") {
    await client.execute("PRAGMA query_only=1");
  }
  const result = await client.execute(trimmed);
  return result.rows.map((row) => ({ ...row }));
}
