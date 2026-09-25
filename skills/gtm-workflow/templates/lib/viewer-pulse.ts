import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

/**
 * What an open viewer polls to learn whether anything it shows changed, so a view reads again only when something
 * did. Every answer is a short fingerprint, never rows: this runs every few seconds per open tab, and Neon bills each
 * byte out of Postgres (lib/read-budgets.ts, viewerPulse).
 */
type Reader = { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> };

export const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("base64url").slice(0, 22);

/**
 * Moves whenever any transaction that wrote commits or rolls back: rows, new or dropped tables, share links. The
 * snapshot's upper bound is the newest finished transaction id plus one, so a write still in progress does not move
 * it and a view never re-reads before the write is visible. Read-only work does not move it. False alarms (a rolled
 * back write) only cost one re-read.
 */
export async function dataVersion(client: Reader): Promise<string> {
  const { rows } = await client.execute(sql`SELECT md5(pg_current_snapshot()::text) AS version`);
  return String(rows[0].version);
}
