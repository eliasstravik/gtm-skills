import { attachDatabasePool } from "@vercel/functions";
import { sql, type ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import pg from "pg";
import { tables } from "./tables";

export type TableName = keyof typeof tables;
/** What db() and a transaction both are. Internal helpers take one first, so code inside a transaction can only use that transaction. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof tables, ExtractTablesWithRelations<typeof tables>>;

const CONNECT_TIMEOUT_MS = 10_000; // covers Neon waking from zero
const WRITE_LOCK_KEY = 7461;

function missingUrl() {
  return new Error(
    process.env.VERCEL
      ? "No DATABASE_URL: connect Neon to this project through the Vercel integration"
      : "No DATABASE_URL: start `npm run dev` or `npm run viewer` first",
  );
}
// node-postgres emits "error" for idle clients whose connection drops; an unhandled one kills the process. Never log the URL.
const logDropped = (error: Error) => console.error(`Database connection dropped: ${error.message}`);

let pool: pg.Pool | undefined;
let instance: ReturnType<typeof drizzle<typeof tables>> | undefined;
/** One Postgres at DATABASE_URL, locally and deployed. Nothing connects at import time. Call only inside "use step" functions and route handlers. */
export function db() {
  if (instance) return instance;
  if (!process.env.DATABASE_URL) throw missingUrl();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  pool.on("error", logDropped);
  if (process.env.VERCEL) attachDatabasePool(pool);
  return (instance = drizzle(pool, { schema: tables }));
}

/** Ends the pool so a process or test can exit; the next db() opens a new one. */
export async function closeDb() {
  const ending = pool;
  pool = undefined;
  instance = undefined;
  await ending?.end();
}

export function table(name: TableName) {
  const t = tables[name];
  if (!t) throw new Error(`Unknown table ${name}; add it to db/tables/index.ts`);
  return t;
}

/** Postgres refuses the NUL character in text and in jsonb strings; fetched pages and provider responses sometimes carry it. */
export function stripNul<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "") as T;
  if (Array.isArray(value)) return value.map(stripNul) as T;
  if (value && typeof value === "object" && !(value instanceof Date))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [stripNul(key), stripNul(item)])) as T;
  return value;
}

/** Insert or update by conflict target: ["key"] for result tables, ["name", "hash"] for cache. */
export async function upsert(tableName: TableName, rows: Record<string, unknown>[], conflictTarget: string[]) {
  if (rows.length === 0) return;
  rows = stripNul(rows);
  const t = table(tableName) as unknown as Record<string, never>;
  const columns = Object.keys(rows[0]).filter((c) => !conflictTarget.includes(c));
  const set = Object.fromEntries(columns.map((c) => [c, sql.raw(`excluded."${c}"`)]));
  await db().insert(t as never).values(rows as never).onConflictDoUpdate({ target: conflictTarget.map((c) => t[c]), set });
}

/**
 * One writer at a time for the profile store and the ledger, which were written for a database with a single writer. Call first in a write
 * transaction. Re-entrant within it, released at commit or rollback. A waiter fails after the limit instead of hanging.
 */
export async function writeLock(tx: Executor, limit = "30s") {
  await tx.execute(sql`SELECT set_config('lock_timeout', ${limit}, true)`);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${WRITE_LOCK_KEY})`);
}

let writers: Promise<unknown> = Promise.resolve();
let wedgedAt = 0;
/**
 * A write transaction for the profile store, the ledger and sharing: queue, transaction, write lock. Writers of this
 * process wait here in memory, one at a time, not on pooled clients: five transactions blocked on the lock would hold
 * the whole pool, and the sixth would fail after the pool's 10 seconds with a connection error instead of the lock's.
 * The queue leaves the other clients free for reads. Inside a transaction it nests without queueing.
 * Waiting in the queue has no time limit, because a long burst over a slow link is legitimate (a write is about eight
 * round trips). But when the writer at the head times out on the lock, those queued behind it fail at once rather
 * than each waiting the limit in turn.
 */
export async function writeTransaction<T>(executor: Executor, fn: (tx: Executor) => Promise<T>, limit = "30s"): Promise<T> {
  const locked = (tx: Executor) => writeLock(tx, limit).then(() => fn(tx));
  if ("rollback" in executor) return executor.transaction(locked);
  const asked = Date.now();
  const turn = writers.then(async () => {
    if (asked < wedgedAt) throw new Error("The write lock is held elsewhere and a writer ahead of this one timed out waiting for it");
    try { return await executor.transaction(locked); }
    catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code === "55P03") wedgedAt = Date.now();
      throw error;
    }
  });
  writers = turn.catch(() => {});
  return turn;
}

const parseTimestamptz = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ) as (value: string) => Date;
/** The query builder returns Date for timestamptz; raw db.execute(sql`…`) returns text. Pass every raw time through this. */
export function toDate(value: unknown): Date {
  return value instanceof Date ? value : parseTimestamptz(String(value));
}

/**
 * Runs one caller-written statement for /api/query and nothing else. Safety comes from Postgres, not from reading the text:
 * a read-only transaction; the extended protocol, which refuses `select 1; commit; insert …`; a 5 second limit; and a
 * throwaway session that is always ended, so a session lock taken by the statement cannot outlive it.
 */
export async function runReadOnly(text: string, args: unknown[]) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw missingUrl();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  client.on("error", logDropped);
  try {
    // Inside the try, so a connect that fails half way is ended too.
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL search_path = public, gtm");
    // queryMode is node-postgres' own option (8.11+) and not yet in @types/pg. Without it a statement with no parameters goes by the simple protocol.
    const result = await client.query({ text, values: args, queryMode: "extended" } as pg.QueryConfig);
    return { columns: result.fields.map((field) => field.name), rows: result.rows as Record<string, unknown>[] };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
