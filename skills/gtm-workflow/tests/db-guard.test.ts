import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type Client } from "@libsql/client";
import {
  guard,
  createGuardState,
  guardSchemaSql,
  ScanRefusedError,
  BudgetExceededError,
  type GuardOptions,
} from "../templates/lib/db-guard";

async function database(people = 40) {
  const inner = createClient({ url: ":memory:" });
  await inner.executeMultiple(`${guardSchemaSql}
    CREATE TABLE people (key TEXT PRIMARY KEY, full_name TEXT, sources_json TEXT);
    CREATE TABLE members (workflow_id TEXT, person_key TEXT, PRIMARY KEY (workflow_id, person_key)) WITHOUT ROWID;`);
  for (let i = 0; i < people; i++)
    await inner.execute({
      sql: "INSERT INTO people VALUES (?,?,?)",
      args: [`p${String(i).padStart(3, "0")}`, `Person ${i}`, '[{"workflow_id":"w"}]'],
    });
  return inner;
}
const open = async (options: Partial<GuardOptions> = {}, inner?: Client) => {
  inner ??= await database();
  return { inner, db: guard(inner, { mode: "strict", scope: "run:test", ...options }) };
};
const setting = (inner: Client, key: string, value: string) =>
  inner.execute({
    sql: "INSERT INTO gtm_settings (key, value, updated_at) VALUES (?,?,'now') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    args: [key, value],
  });

test("strict mode refuses a full scan even when the table is aliased", async () => {
  const { db } = await open();
  await assert.rejects(
    db.execute("SELECT pp.key FROM people pp WHERE pp.full_name = 'x'"),
    (error: unknown) =>
      error instanceof ScanRefusedError &&
      /people/.test(error.message) &&
      /nextBatch|index/.test(error.message),
  );
});

test("strict mode refuses a JSON membership scan and a covering-index count", async () => {
  const { db } = await open();
  await assert.rejects(
    db.execute({
      sql: "SELECT key FROM people population_person WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(population_person.sources_json,'[]')) m WHERE json_extract(m.value,'$.workflow_id') = ?)",
      args: ["w"],
    }),
    ScanRefusedError,
  );
  await assert.rejects(db.execute("SELECT COUNT(*) FROM people"), ScanRefusedError);
});

test("strict mode refuses OFFSET paging and allows key paging", async () => {
  const { db } = await open();
  await assert.rejects(
    db.execute("SELECT key FROM people WHERE key > '' ORDER BY key LIMIT 5 OFFSET 10"),
    /OFFSET/,
  );
  const page = await db.execute({
    sql: "SELECT key FROM people WHERE key > ? ORDER BY key LIMIT 5",
    args: ["p009"],
  });
  assert.deepEqual(page.rows.map((r) => r.key), ["p010", "p011", "p012", "p013", "p014"]);
});

test("strict mode allows index searches, materialized subqueries and json_each of one row", async () => {
  const { db } = await open();
  await db.execute(
    "WITH c AS MATERIALIZED (SELECT key FROM people WHERE key > 'p030' LIMIT 3) SELECT * FROM c",
  );
  const roles = await db.execute({
    sql: "SELECT m.value FROM people p, json_each(p.sources_json) m WHERE p.key = ?",
    args: ["p001"],
  });
  assert.equal(roles.rows.length, 1);
  await db.execute({ sql: "UPDATE people SET full_name = 'y' WHERE key = ?", args: ["p001"] });
});

test("strict mode checks statements inside transactions and batches", async () => {
  const { db } = await open();
  const tx = await db.transaction("write");
  await assert.rejects(tx.execute("UPDATE people SET full_name = 'z' WHERE full_name = 'a'"), ScanRefusedError);
  await tx.rollback();
  tx.close();
  await assert.rejects(db.batch(["SELECT COUNT(*) FROM people"], "read"), ScanRefusedError);
});

test("write statements are planned by their read part and leave transactions able to commit", async () => {
  const { db, inner } = await open();
  const tx = await db.transaction("write");
  await tx.execute({
    sql: "INSERT INTO people (key, full_name, sources_json) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET full_name = excluded.full_name WHERE people.key = excluded.key",
    args: ["p001", "Upserted", "[]"],
  });
  await tx.execute({ sql: "UPDATE people SET full_name = (SELECT 'sub' WHERE 1) WHERE key = ? RETURNING key", args: ["p002"] });
  await tx.execute({ sql: "DELETE FROM people WHERE key = ?", args: ["p003"] });
  await tx.commit();
  tx.close();
  assert.equal((await inner.execute("SELECT full_name FROM people WHERE key = 'p001'")).rows[0].full_name, "Upserted");
  await assert.rejects(db.execute("DELETE FROM people"), ScanRefusedError);
  await assert.rejects(db.execute({ sql: "UPDATE people SET full_name = ? WHERE full_name = ?", args: ["a", "b"] }), ScanRefusedError);
  await assert.rejects(
    db.execute({ sql: "INSERT INTO members (workflow_id, person_key) SELECT ?, key FROM people WHERE full_name = ? ON CONFLICT DO NOTHING", args: ["w", "x"] }),
    ScanRefusedError,
  );
  await db.execute({ sql: "INSERT INTO members (workflow_id, person_key) SELECT ?, key FROM people WHERE key = ? ON CONFLICT DO NOTHING", args: ["w", "p004"] });
  assert.equal((await inner.execute("SELECT COUNT(*) AS n FROM members")).rows[0].n, 1);
});

test("interactive mode allows a scan and charges table size plus rows returned", async () => {
  const { db, inner } = await open({ mode: "interactive", scope: "agent:thread-1" });
  const result = await db.execute("SELECT key FROM people WHERE full_name LIKE 'Person 1%'");
  assert.equal(result.rows.length, 11);
  assert.equal(db.lastCharge(), 40 + 11);
  await db.flush();
  const used = await inner.execute("SELECT scope, used FROM usage_budget ORDER BY scope");
  assert.deepEqual(
    used.rows.map((r) => [String(r.scope).replace(/\d{4}-\d{2}-\d{2}/, "DAY"), Number(r.used)]),
    [["agent:thread-1", 51], ["day:DAY", 51]],
  );
});

test("interactive mode charges a JSON expansion under a scan five times the table", async () => {
  const { db } = await open({ mode: "interactive", scope: "agent:thread-2" });
  await db.execute(
    "SELECT COUNT(*) AS n FROM people p, json_each(p.sources_json) m WHERE json_extract(m.value,'$.workflow_id') = 'w'",
  );
  assert.equal(db.lastCharge(), 40 * 5 + 1);
});

test("interactive mode refuses one statement above the statement cap", async () => {
  const inner = await database();
  await setting(inner, "rows_per_statement", "30");
  const { db } = await open({ mode: "interactive", scope: "agent:thread-3" }, inner);
  await assert.rejects(
    db.execute("SELECT key FROM people WHERE full_name = 'x'"),
    (error: unknown) => error instanceof BudgetExceededError && /rows_per_statement/.test(error.message),
  );
});

test("a spent budget stops the work and names the setting to change", async () => {
  const inner = await database();
  await setting(inner, "rows_per_conversation", "60");
  const { db } = await open({ mode: "interactive", scope: "agent:thread-4" }, inner);
  await db.execute("SELECT key FROM people WHERE full_name = 'x'");
  await db.execute("SELECT key FROM people WHERE full_name = 'x'");
  await assert.rejects(
    db.execute("SELECT key FROM people WHERE key = 'p001'"),
    (error: unknown) =>
      error instanceof BudgetExceededError &&
      /agent:thread-4/.test(error.message) &&
      /rows_per_conversation/.test(error.message),
  );
});

test("a run's own cap, set for that run, overrides the default up to the ceiling", async () => {
  const inner = await database();
  await setting(inner, "rows_per_run", "5");
  await setting(inner, "rows_per_run_ceiling", "1000");
  const { db } = await open({ scope: "run:big" }, inner);
  assert.equal(await db.setRunBudget(5000), 1000);
  for (let i = 0; i < 3; i++)
    await db.execute("SELECT key FROM people WHERE key > '' ORDER BY key LIMIT 10");
  await db.flush();
  const { db: small } = await open({ scope: "run:small" }, inner);
  await small.execute("SELECT key FROM people WHERE key > '' ORDER BY key LIMIT 10");
  await assert.rejects(small.execute("SELECT key FROM people WHERE key = 'p001'"), BudgetExceededError);
});

test("warn mode refuses nothing and records what it would have refused", async () => {
  const inner = await database();
  await setting(inner, "guard_mode", "warn");
  await setting(inner, "rows_per_run", "5");
  const { db } = await open({ scope: "run:warned" }, inner);
  const result = await db.execute("SELECT pp.key FROM people pp WHERE pp.full_name = 'Person 3'");
  assert.equal(result.rows.length, 1);
  await db.execute("SELECT pp.key FROM people pp WHERE pp.full_name = 'Person 3'");
  await db.execute("SELECT key FROM people WHERE key > '' ORDER BY key LIMIT 10");
  await db.flush();
  const log = await inner.execute("SELECT kind, scope, tables, would_charge, hits FROM guard_log ORDER BY kind");
  assert.deepEqual(
    log.rows.map((r) => [r.kind, r.scope, r.tables, Number(r.hits)]),
    [["budget", "run:warned", "", 1], ["scan", "run:warned", "people", 2]],
  );
  assert.equal(Number(log.rows[1].would_charge), 41);
});

test("the guard's own bookkeeping never counts as a scan and plans are cached per statement shape", async () => {
  const { db, inner } = await open();
  let explains = 0;
  const execute = inner.execute.bind(inner);
  inner.execute = ((statement: never) => {
    if (/^EXPLAIN/.test(typeof statement === "string" ? statement : (statement as { sql: string }).sql)) explains++;
    return execute(statement);
  }) as typeof inner.execute;
  await db.execute({ sql: "SELECT key FROM people WHERE key IN (?,?)", args: ["p001", "p002"] });
  await db.execute({ sql: "SELECT key FROM people WHERE key IN (?,?,?)", args: ["p001", "p002", "p003"] });
  assert.equal(explains, 1);
});

test("clients that share state plan a statement once and write small charges together, not per client", async () => {
  const inner = await database();
  const state = createGuardState();
  let explains = 0;
  let budgetWrites = 0;
  const execute = inner.execute.bind(inner);
  inner.execute = ((statement: never) => {
    const sql = typeof statement === "string" ? statement : (statement as { sql: string }).sql;
    if (/^EXPLAIN/.test(sql)) explains++;
    if (/^INSERT INTO usage_budget/.test(sql)) budgetWrites++;
    return execute(statement);
  }) as typeof inner.execute;
  for (let i = 0; i < 10; i++) {
    const db = guard(inner, { mode: "strict", scope: "run:shared", state });
    await db.execute({ sql: "SELECT key FROM people WHERE key = ?", args: [`p00${i}`] });
    // A short-lived client closes without awaiting; the test must not close the shared in-memory database.
    await db.settle();
  }
  assert.equal(explains, 1);
  assert.equal(budgetWrites, 0);
  const last = guard(inner, { mode: "strict", scope: "run:shared", state });
  assert.deepEqual(await last.budget(), { scope: "run:shared", used: 10, cap: 200000 });
  await last.flush();
  assert.equal(budgetWrites, 2);
  assert.equal((await inner.execute("SELECT used FROM usage_budget WHERE scope = 'run:shared'")).rows[0].used, 10);
});
