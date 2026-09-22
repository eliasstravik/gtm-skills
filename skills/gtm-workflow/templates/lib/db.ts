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
const POOL_MAX_DEFAULT = 16; // twelve provider workers plus readers; Neon's pooler shares server connections per transaction
const POOL_MAX_CEILING = 32;
/** How many write transactions of this process may hold a pooled client at once; the rest wait in memory, so reads always find a client. */
const READ_RESERVE = 2;

function missingUrl() {
  return new Error(
    process.env.VERCEL
      ? "No DATABASE_URL: connect Neon to this project through the Vercel integration"
      : "No DATABASE_URL: start `npm run dev` or `npm run viewer` first",
  );
}
// node-postgres emits "error" for idle clients whose connection drops; an unhandled one kills the process. Never log the URL.
const logDropped = (error: Error) => console.error(`Database connection dropped: ${error.message}`);

/** GTM_DB_POOL_MAX sizes the pool to the worker count; 16 covers the network workflow's twelve workers with clients to spare for reads. */
export function poolSize() {
  const asked = Number(process.env.GTM_DB_POOL_MAX);
  return Number.isInteger(asked) && asked > 0 ? Math.min(asked, POOL_MAX_CEILING) : POOL_MAX_DEFAULT;
}

/**
 * Bytes this process received from Postgres, counted on the client where the connection's socket hands them over
 * (after TLS, so what Neon counts as data transfer, give or take the protocol's framing) and attributed to the
 * statement that connection was running. Per statement shape, so a run's reads can be seen path by path:
 * `readBytes()` at any time, or GTM_DB_LOG_READS=1 to print the heaviest shapes when the process exits.
 * tests/read-budgets.test.ts holds every path to the budgets in lib/read-budgets.ts.
 */
export type ReadShape = { shape: string; bytes: number; statements: number };
const reads = { total: 0, statements: 0, shapes: new Map<string, ReadShape>() };
const SHAPE_LENGTH = 160;
/** One statement text per shape: parameters, literals and lists collapse, so `in ($1, $2, $3)` and `in ($1)` are one path. */
export function statementShape(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/'(?:[^']|'')*'/g, "'?'")
    .replace(/\$\d+/g, "$?")
    .replace(/\$\?(?:, ?\$\?)+/g, "$?…")
    .trim()
    .slice(0, SHAPE_LENGTH);
}
type MeteredClient = pg.Client & { _activeQuery?: { text?: string } | null; connection?: { stream?: { prependListener(event: "data", listener: (chunk: Buffer) => void): unknown } } };
/**
 * Counts every chunk the connection's socket receives against the statement the client is running on it. The listener
 * goes before the driver's own, which would already have finished the statement when a whole answer arrives in one chunk.
 */
function meterClient(client: pg.Client) {
  const stream = (client as MeteredClient).connection?.stream;
  if (!stream) return;
  stream.prependListener("data", (chunk: Buffer) => {
    reads.total += chunk.length;
    const text = (client as MeteredClient)._activeQuery?.text;
    if (typeof text !== "string") return;
    const shape = statementShape(text);
    const entry = reads.shapes.get(shape) ?? { shape, bytes: 0, statements: 0 };
    entry.bytes += chunk.length;
    reads.shapes.set(shape, entry);
  });
  const original = client.query;
  // Statements are counted as they are queued; the bytes follow when the answer arrives.
  (client as { query: unknown }).query = function (this: pg.Client, ...args: unknown[]) {
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string } | undefined)?.text;
    if (typeof text === "string") {
      reads.statements += 1;
      const shape = statementShape(text);
      const entry = reads.shapes.get(shape) ?? { shape, bytes: 0, statements: 0 };
      entry.statements += 1;
      reads.shapes.set(shape, entry);
    }
    return (original as (...a: unknown[]) => unknown).apply(this, args);
  };
}
/** Bytes received from Postgres so far and the statement shapes that cost the most, heaviest first. */
export function readBytes(): { total: number; statements: number; shapes: ReadShape[] } {
  return { total: reads.total, statements: reads.statements, shapes: [...reads.shapes.values()].sort((a, b) => b.bytes - a.bytes).map((s) => ({ ...s })) };
}
export function resetReadBytes() {
  reads.total = 0;
  reads.statements = 0;
  reads.shapes.clear();
}
let logReadsOnExit = false;
function logReads() {
  if (logReadsOnExit || !process.env.GTM_DB_LOG_READS) return;
  logReadsOnExit = true;
  process.on("exit", () => {
    const { total, statements, shapes } = readBytes();
    console.error(`Database reads: ${total} bytes received over ${statements} statements`);
    for (const s of shapes.slice(0, 15)) console.error(`  ${s.bytes} bytes, ${s.statements} statements: ${s.shape}`);
  });
}

let pool: pg.Pool | undefined;
let instance: ReturnType<typeof drizzle<typeof tables>> | undefined;
/** One Postgres at DATABASE_URL, locally and deployed. Nothing connects at import time. Call only inside "use step" functions and route handlers. */
export function db() {
  if (instance) return instance;
  if (!process.env.DATABASE_URL) throw missingUrl();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: poolSize(), connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  pool.on("error", logDropped);
  pool.on("connect", meterClient);
  logReads();
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

const LIMIT = /^\d+(ms|s|min)$/;
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;
/** The lock limit each write transaction was opened with; lockNames applies it in the same round trip as the locks. */
const limits = new WeakMap<object, string>();
/** The names a transaction already holds: a repeat within it costs nothing. */
const held = new WeakMap<object, Set<string>>();
/**
 * Transaction-scoped advisory locks on names, for the things a write is about to create or move: an identifier value
 * that two writers might both claim, a reservation that two workers might both make, a run being begun. Records that
 * already exist are locked by their rows (`SELECT … FOR UPDATE`) instead. Every write transaction starts here, with
 * all its names in one batch: the names are sorted, so two transactions wanting the same names wait on each other in
 * one order and never in a cycle. Re-entrant within the transaction, released at commit or rollback. A waiter fails
 * after the transaction's limit (error code 55P03) instead of hanging on a lock held by a stuck process; the same
 * limit then covers the transaction's row locks. One round trip; none when the transaction already holds the names.
 */
export async function lockNames(tx: Executor, names: string[], limit = limits.get(tx) ?? "30s") {
  if (!LIMIT.test(limit)) throw new Error(`Invalid lock limit ${limit}`);
  let mine = held.get(tx);
  const statements: string[] = [];
  if (!mine) {
    held.set(tx, (mine = new Set()));
    statements.push(`SET LOCAL lock_timeout = ${literal(limit)}`);
  }
  const wanted = [...new Set(names)].filter((name) => !mine.has(name)).sort();
  // unnest keeps the array's order, so the locks are taken in sorted order.
  if (wanted.length) statements.push(`SELECT pg_advisory_xact_lock(hashtextextended(name, 0)) FROM unnest(ARRAY[${wanted.map(literal).join(",")}]::text[]) AS name`);
  if (!statements.length) return;
  // Two statements in one round trip: without parameters node-postgres uses the simple protocol, which allows it.
  await tx.execute(sql.raw(statements.join("; ")));
  for (const name of wanted) mine.add(name);
}

const code = (error: unknown) => (error as { cause?: { code?: string }; code?: string })?.cause?.code ?? (error as { code?: string })?.code;
const DEADLOCK_RETRIES = 3;

/** A counting semaphore: writers beyond the permits wait here in memory, without a time limit, not on pooled clients. */
class Semaphore {
  private waiting: (() => void)[] = [];
  private held = 0;
  constructor(private readonly permits: number) {}
  async acquire() {
    if (this.held < this.permits) { this.held += 1; return; }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.held -= 1;
  }
}
let writers: Semaphore | undefined;

/**
 * A write transaction for the profile store, the ledger and sharing. Locks are per record and per identifier (see
 * lockNames), so writers of different people or companies run in parallel; only writers of the same record or the
 * same identifier wait for each other. Writers of this process beyond the pool's capacity wait here in memory, so
 * five transactions blocked on a lock cannot hold the whole pool and starve reads. Inside a transaction it nests
 * without a new transaction or permit. A transaction that Postgres aborts as a deadlock victim (rare: two merges
 * touching the same records in opposite order) is rolled back and run again; nothing outside the database happens
 * inside one, so that is safe. `limit` is the time a lock waits before the transaction fails.
 */
export async function writeTransaction<T>(executor: Executor, fn: (tx: Executor) => Promise<T>, limit = "30s"): Promise<T> {
  if ("rollback" in executor) return fn(executor);
  writers ??= new Semaphore(Math.max(1, poolSize() - READ_RESERVE));
  await writers.acquire();
  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await executor.transaction((tx) => {
          limits.set(tx, limit);
          return fn(tx);
        });
      } catch (error) {
        if (code(error) !== "40P01" || attempt >= DEADLOCK_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.random() * 20));
      }
    }
  } finally {
    writers.release();
  }
}

const parseTimestamptz = pg.types.getTypeParser(pg.types.builtins.TIMESTAMPTZ) as (value: string) => Date;
/** The query builder returns Date for timestamptz; raw db.execute(sql`…`) returns text. Pass every raw time through this. */
export function toDate(value: unknown): Date {
  return value instanceof Date ? value : parseTimestamptz(String(value));
}

/** The most rows one FETCH brings: a few round trips for a page, and little fetched past the byte limit. */
const FETCH_ROWS = 100;
const errorCode = (error: unknown) => (error as { code?: string })?.code;
export type ReadOnlyResult = { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean };
/**
 * Runs one caller-written statement for /api/query and nothing else. Safety comes from Postgres, not from reading the text:
 * a read-only transaction; the extended protocol, which refuses `select 1; commit; insert …`; a 5 second limit; and a
 * throwaway session that is always ended, so a session lock taken by the statement cannot outlive it.
 *
 * The statement runs behind a cursor, so what leaves Postgres is bounded by `limits` (lib/read-budgets.ts) however it
 * is written: a `select *` over a table of thousands sends the first rows and stops. Rows past the row limit, or past
 * the byte limit (measured as the rows' JSON), are not fetched, and `truncated` says so. A statement a cursor cannot
 * hold (EXPLAIN, SHOW, and every write, which the read-only transaction refuses) runs directly, its rows cut in memory.
 */
export async function runReadOnly(text: string, args: unknown[], limits: { rows: number; bytes: number }): Promise<ReadOnlyResult> {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw missingUrl();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  client.on("error", logDropped);
  // queryMode is node-postgres' own option (8.11+) and not yet in @types/pg. Without it a statement with no parameters goes by the simple protocol.
  const extended = (statement: string, values: unknown[] = []) => client.query({ text: statement, values, queryMode: "extended" } as pg.QueryConfig);
  try {
    // Inside the try, so a connect that fails half way is ended too.
    await client.connect();
    meterClient(client);
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL search_path = public, gtm");
    // On its own lines, so a trailing line comment cannot swallow the cursor's syntax; a trailing semicolon would.
    const statement = text.replace(/[\s;]+$/, "");
    let declared = true;
    try {
      await extended(`DECLARE gtm_query NO SCROLL CURSOR FOR\n${statement}\n`, args);
    } catch (error) {
      // 42601 syntax error, 0A000 feature not supported: not a query a cursor can hold. Anything else is the statement's own error.
      if (!["42601", "0A000"].includes(errorCode(error) ?? "")) throw error;
      declared = false;
    }
    if (!declared) {
      const result = await extended(statement, args);
      return { columns: result.fields.map((field) => field.name), rows: result.rows.slice(0, limits.rows) as Record<string, unknown>[], truncated: result.rows.length > limits.rows };
    }
    const rows: Record<string, unknown>[] = [];
    let columns: string[] | undefined, bytes = 0, truncated = false;
    while (!truncated) {
      // One row past the row limit tells that more exist; past the first batch, a fetch asks for no more rows than the byte limit has room for at the size seen so far.
      const room = rows.length ? Math.ceil((limits.bytes - bytes) / (bytes / rows.length)) : FETCH_ROWS;
      const count = Math.max(1, Math.min(FETCH_ROWS, limits.rows + 1 - rows.length, room));
      const batch = await client.query(`FETCH FORWARD ${count} FROM gtm_query`);
      columns ??= batch.fields.map((field) => field.name);
      for (const row of batch.rows as Record<string, unknown>[]) {
        bytes += Buffer.byteLength(JSON.stringify(row));
        if (rows.length >= limits.rows || bytes > limits.bytes) { truncated = true; break; }
        rows.push(row);
      }
      if (batch.rows.length < count) break;
    }
    return { columns: columns ?? [], rows, truncated };
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end().catch(() => {});
  }
}
