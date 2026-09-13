import { createClient } from "@libsql/client";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { tables } from "../db/tables";

export type TableName = keyof typeof tables;

function credentials() {
  if (!process.env.VERCEL) return { url: "file:./data/gtm.db" };
  const { TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: authToken } = process.env;
  if (!url) throw new Error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on the Vercel project");
  return { url, authToken };
}

let instance: ReturnType<typeof drizzle<typeof tables>> | undefined;
/** Local: file:./data/gtm.db. Vercel: Turso. Call only inside "use step" functions. */
export function db() {
  return (instance ??= drizzle(createClient(credentials()), { schema: tables }));
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
