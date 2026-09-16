import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { lstat, open } from "node:fs/promises";
import { requireThat } from "./errors.mjs";

/** Stores only metadata. Submitted values never enter a SQL argument. */
export async function openJournal(options) {
  if (options.url.startsWith("file:")) {
    const path = options.url.slice(5);
    try {
      const stat = await lstat(path);
      requireThat(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && (!process.getuid || stat.uid === process.getuid()), "unsafe_state_file", 403);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try { const file = await open(path, "wx", 0o600); await file.close(); }
      catch (created) {
        if (created.code !== "EEXIST") throw created;
        const stat = await lstat(path);
        requireThat(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && (!process.getuid || stat.uid === process.getuid()), "unsafe_state_file", 403);
      }
    }
  }
  const db = createClient(options);
  await db.batch([
    `CREATE TABLE IF NOT EXISTS connection_meta (variable TEXT PRIMARY KEY, label TEXT, state TEXT NOT NULL, generation INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, variable TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, phase TEXT NOT NULL, prior_version TEXT NOT NULL, deployment TEXT, saved_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, superseded_by TEXT)`,
    `CREATE TABLE IF NOT EXISTS lease (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires INTEGER NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS setup (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS consumed (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)`,
  ], "write");
  const query = (sql, args = []) => db.execute({ sql, args });
  if (!(await query("PRAGMA table_info(operations)")).rows.some((row) => row.name === "superseded_by")) {
    try { await query("ALTER TABLE operations ADD COLUMN superseded_by TEXT"); }
    catch (error) { if (!(await query("PRAGMA table_info(operations)")).rows.some((row) => row.name === "superseded_by")) throw error; }
  }
  await query("UPDATE operations SET phase='failed',updated_at=? WHERE phase='prepared' AND NOT EXISTS (SELECT 1 FROM lease WHERE expires >= ?)", [Date.now(), Date.now()]);
  await query("UPDATE operations SET phase='unresolved',updated_at=? WHERE phase='write_attempted' AND NOT EXISTS (SELECT 1 FROM lease WHERE expires >= ?)", [Date.now(), Date.now()]);
  await query("DELETE FROM operations WHERE (phase IN ('saved','failed') OR superseded_by IS NOT NULL) AND updated_at < ?", [Date.now() - 90 * 86400000]);
  await query("DELETE FROM setup WHERE key LIKE 'revoked:%' AND CAST(value AS INTEGER) < ?", [Math.floor(Date.now() / 1000)]);
  return {
    close: () => db.close(),
    async list() { return (await query("SELECT * FROM connection_meta ORDER BY variable")).rows; },
    async operations() { return (await query("SELECT * FROM operations WHERE (phase IN ('prepared','write_attempted','unresolved') AND superseded_by IS NULL) OR id IN (SELECT id FROM operations ORDER BY created_at DESC, rowid DESC LIMIT 500) ORDER BY created_at DESC, rowid DESC")).rows; },
    async operation(id) { return (await query("SELECT * FROM operations WHERE id=?", [id])).rows[0]; },
    async consume(id, expires) {
      await query("DELETE FROM consumed WHERE expires < ?", [Date.now()]);
      const result = await query("INSERT OR IGNORE INTO consumed VALUES (?,?)", [id, expires]);
      requireThat(result.rowsAffected === 1, "transaction_used", 403);
    },
    async get(key) { const row = (await query("SELECT value FROM setup WHERE key=?", [key])).rows[0]; return row ? JSON.parse(row.value) : null; },
    async set(key, value) { await query("INSERT OR REPLACE INTO setup VALUES (?,?)", [key, JSON.stringify(value)]); },
    async acquire() {
      const owner = randomUUID(), now = Date.now();
      const result = await query("INSERT INTO lease VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, expires=excluded.expires WHERE lease.expires < ?", [owner, now + 60000, now]);
      requireThat(result.rowsAffected === 1, "operation_in_progress", 409);
      await query("UPDATE operations SET phase='failed', updated_at=? WHERE phase='prepared'", [now]);
      // A dispatched operation is never retried after its worker lost ownership.
      await query("UPDATE operations SET phase='unresolved', updated_at=? WHERE phase='write_attempted'", [now]);
      return owner;
    },
    async fence(owner) {
      const row = (await query("SELECT owner,expires FROM lease WHERE id=1")).rows[0];
      requireThat(row?.owner === owner && Number(row.expires) > Date.now(), "lease_expired", 409);
    },
    async release(owner) { await query("DELETE FROM lease WHERE owner=?", [owner]); },
    async prepare(input, actor, deployment) {
      await query("INSERT INTO operations (id,variable,action,actor,phase,prior_version,deployment,created_at,updated_at) VALUES (?,?,?,?,'prepared',?,?,?,?)",
        [input.id, input.variable, input.action, actor, input.version, deployment ?? null, Date.now(), Date.now()]);
    },
    async phase(id, phase, version = null, owner) {
      const result = await query("UPDATE operations SET phase=?,saved_version=?,updated_at=? WHERE id=?" + (owner ? " AND EXISTS (SELECT 1 FROM lease WHERE owner=? AND expires>?)" : ""),
        [phase, version, Date.now(), id, ...(owner ? [owner, Date.now()] : [])]);
      requireThat(!owner || result.rowsAffected === 1, "lease_expired", 409);
    },
    async saved(input, owner, savedVersion) {
      const tx = await db.transaction("write");
      try {
        const lease = (await tx.execute({ sql: "SELECT owner,expires FROM lease WHERE id=1", args: [] })).rows[0];
        requireThat(lease?.owner === owner && Number(lease.expires) > Date.now(), "lease_expired", 409);
        const current = await tx.execute("SELECT MAX(generation) AS generation FROM connection_meta");
        const generation = Number(current.rows[0]?.generation ?? 0) + 1;
        await tx.execute({ sql: "INSERT INTO connection_meta VALUES (?,?,?,?,?) ON CONFLICT(variable) DO UPDATE SET label=COALESCE(excluded.label,connection_meta.label),state=excluded.state,generation=excluded.generation,updated_at=excluded.updated_at",
          args: [input.variable, input.label ?? null, input.action === "disconnect" ? "disconnected" : "saved", generation, Date.now()] });
        if (input.supersede === true) await tx.execute({ sql: "UPDATE operations SET superseded_by=? WHERE variable=? AND id<>? AND phase='unresolved' AND superseded_by IS NULL", args: [input.id, input.variable, input.id] });
        await tx.execute({ sql: "UPDATE operations SET phase='saved',saved_version=?,updated_at=? WHERE id=?", args: [savedVersion ?? String(generation), Date.now(), input.id] });
        await tx.commit(); return generation;
      } finally { tx.close(); }
    },
  };
}
