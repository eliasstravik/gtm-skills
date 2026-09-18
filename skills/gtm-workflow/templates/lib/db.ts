import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { tables } from "../db/tables";
import { createGuardState, guard, type GuardContext, type GuardedClient } from "./db-guard";

export type TableName = keyof typeof tables;

function credentials() {
  // scripts/check-queries.mjs points every client at its seeded database while it runs the workflow queries.
  if (process.env.GTM_CHECK_DATABASE) return { url: process.env.GTM_CHECK_DATABASE };
  if (!process.env.VERCEL) return { url: "file:./data/gtm.db" };
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the Vercel project");
  return { url, authToken };
}

/** Inside a workflow run every client is strict and charges that run, whatever its caller asked for. */
async function runContext(): Promise<Partial<GuardContext> | undefined> {
  try {
    const { getWorkflowMetadata } = await import("workflow");
    return { mode: "strict", scope: `run:${getWorkflowMetadata().workflowRunId}` };
  } catch {
    return undefined;
  }
}

/** One per process: every client reads the same database, so plans and pending charges are shared. */
const guardState = createGuardState();

/** Who a route-side client reads for. Only an entry point a person or the hosted agent drives may ask for this. */
export type ClientUse = { interactive: "agent" | "browse"; conversation?: string | null };

/**
 * The one way into the database: a libsql client behind the guard in lib/db-guard.ts, which refuses full table
 * scans and charges a row-read budget. Nothing else in the workspace creates a client (scripts/check-queries.mjs
 * fails the build otherwise). The default is strict; `use` marks a one-off question or a person browsing, which may
 * scan within a budget. The name is kept for workflows written before the guard.
 */
export function rawClient(use?: ClientUse): GuardedClient {
  const day = new Date().toISOString().slice(0, 10);
  const conversation = use?.conversation?.trim().slice(0, 200);
  const scope = !use
    ? "system"
    : use.interactive === "browse"
      ? `browse:${day}`
      : conversation
        ? `agent:${conversation}`
        : `agent-day:${day}`;
  return guard(createClient(credentials()), { mode: use ? "interactive" : "strict", scope, resolve: runContext, state: guardState });
}

let instance: ReturnType<typeof drizzle<typeof tables>> | undefined;
/** Local: file:./data/gtm.db. Vercel: Turso. Call only inside "use step" functions. */
export function db() {
  return (instance ??= drizzle(rawClient(), { schema: tables }));
}

/** Give this run its own row-read budget, clamped to rows_per_run_ceiling. Returns the cap applied. */
export async function setRunReadBudget(rows: number): Promise<number> {
  const client = rawClient();
  try {
    return await client.setRunBudget(rows);
  } finally {
    client.close();
  }
}

export function table(name: TableName) {
  const t = tables[name];
  if (!t) throw new Error(`Unknown table ${name}; add it to db/tables/index.ts`);
  return t;
}

/** Insert or update by conflict target: ["key"] for result tables, ["name", "hash"] for cache. */
export async function upsert(tableName: TableName, rows: Record<string, unknown>[], conflictTarget: string[]) {
  if (rows.length === 0) return;
  const t = table(tableName) as unknown as Record<string, never>;
  const columns = Object.keys(rows[0]).filter((c) => !conflictTarget.includes(c));
  const set = Object.fromEntries(columns.map((c) => [c, sql.raw(`excluded."${c}"`)]));
  await db().insert(t as never).values(rows as never).onConflictDoUpdate({ target: conflictTarget.map((c) => t[c]), set });
}
