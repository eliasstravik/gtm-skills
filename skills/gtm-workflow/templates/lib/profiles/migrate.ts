import type { Client } from "@libsql/client";
import { profileBackfills, profileLookupSql } from "./schema";

/**
 * Side tables, their triggers and their backfills. Triggers are created before a backfill runs, so a row written
 * at any moment is covered by one or the other. A backfill scans its table, so it runs once per database and is
 * recorded in schema_backfills; running it twice would change nothing.
 */
export async function migrateProfileLookups(client: Pick<Client, "execute" | "executeMultiple">) {
  await client.executeMultiple(profileLookupSql);
  const done = new Set((await client.execute("SELECT name FROM schema_backfills")).rows.map((r) => String(r.name)));
  const ran: string[] = [];
  for (const backfill of profileBackfills) {
    if (done.has(backfill.name)) continue;
    await client.executeMultiple(backfill.sql);
    await client.execute({
      sql: "INSERT OR IGNORE INTO schema_backfills (name, done_at) VALUES (?, ?)",
      args: [backfill.name, new Date().toISOString()],
    });
    ran.push(backfill.name);
  }
  return ran;
}
