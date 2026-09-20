import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pgTable, text } from "drizzle-orm/pg-core";
import { migrate } from "../templates/scripts/migrate.mjs";
import { mergeTables } from "../templates/lib/tables";
import { testDatabase } from "./db";

const runtime = process.env.GTM_TEST_RUNTIME!;

test("migrating twice changes nothing, and each owner's tables land in its own schema", async () => {
  const database = await testDatabase();
  try {
    const tables = () => database.query("SELECT table_schema || '.' || table_name AS name FROM information_schema.tables WHERE table_schema IN ('gtm', 'public', 'drizzle') ORDER BY 1");
    const journal = () => database.query("SELECT (SELECT count(*)::int FROM drizzle.gtm_runtime_migrations) AS runtime, (SELECT count(*)::int FROM drizzle.gtm_workspace_migrations) AS workspace");
    const before = { tables: (await tables()).rows, journal: (await journal()).rows };
    await migrate(database.unpooled);
    assert.deepEqual({ tables: (await tables()).rows, journal: (await journal()).rows }, before);
    const names = before.tables.map((row) => row.name).filter((name) => name !== "public.gtm_scratch_marker");
    // The local role is named like the runtime schema; without the pinned search path these would be gtm.example_*.
    assert.ok(names.includes("public.example_scores") && names.includes("public.example_research"));
    assert.ok(["cache", "people", "companies", "profile_identifiers", "profile_runs", "profile_work", "profile_attempts", "profile_inputs", "gtm_viewer_grants"].every((name) => names.includes(`gtm.${name}`)));
    assert.deepEqual(names.filter((name) => name.startsWith("gtm.example") || /^public\.(cache|people|companies|profile_|gtm_viewer)/.test(name)), []);
  } finally { await database.close(); }
});

test("two builds migrating an empty database at once both succeed", { skip: process.env.GTM_TEST_SCRATCH === "1" }, async () => {
  const database = await testDatabase({ migrated: false });
  try {
    // Without a lock both read an empty journal and both run 0000; the second dies on CREATE SCHEMA "gtm".
    await Promise.all([migrate(database.unpooled), migrate(database.unpooled), migrate(database.unpooled)]);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM drizzle.gtm_runtime_migrations")).rows[0].n, 1);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'")).rows[0].n, 0);
  } finally { await database.close(); }
});

const commandLine = (env: Record<string, string>) => spawnSync(process.execPath, [join(runtime, "scripts/migrate.mjs")], {
  cwd: runtime, encoding: "utf8",
  env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env },
});

test("a build with no database skips migrations; a production build without one fails", { skip: process.env.GTM_TEST_SCRATCH === "1" }, () => {
  const local = commandLine({});
  assert.equal(local.status, 0, local.stderr);
  assert.match(local.stdout, /skipping migrations/);
  const production = commandLine({ VERCEL_ENV: "production" });
  assert.notEqual(production.status, 0);
  assert.match(production.stderr, /connect Neon/);
  const external = commandLine({ GTM_DATABASE: "external" });
  assert.notEqual(external.status, 0);
});

test("remote URLs in the shell are ignored by a local or preview build", { skip: process.env.GTM_TEST_SCRATCH === "1" }, () => {
  const remote = { DATABASE_URL: "postgres://nobody:nothing@remote.invalid/db", DATABASE_URL_UNPOOLED: "postgres://nobody:nothing@remote.invalid/db" };
  for (const env of [remote, { ...remote, VERCEL: "1", VERCEL_ENV: "preview" }]) {
    const result = commandLine(env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skipping migrations/);
    assert.doesNotMatch(result.stdout + result.stderr, /remote\.invalid/);
  }
});

test("a workspace table may not take a runtime table's name", () => {
  assert.throws(() => mergeTables({ people: pgTable("my_people", { key: text("key").primaryKey() }) }), /reserved by the runtime/);
  assert.throws(() => mergeTables({ mine: pgTable("cache", { key: text("key").primaryKey() }) }), /cache is reserved by the runtime/);
  assert.ok("mine" in mergeTables({ mine: pgTable("mine", { key: text("key").primaryKey() }) }));
});
