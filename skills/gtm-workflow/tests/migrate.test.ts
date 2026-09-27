import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pgTable, text } from "drizzle-orm/pg-core";
import { DESTRUCTIVE_OPT_IN, checkFolder, destructiveStatements, migrate } from "../templates/scripts/migrate.mjs";
import { isProductionDatabase, neonHost } from "../templates/scripts/local-database.mjs";
import { mergeTables } from "../templates/lib/tables";
import { testDatabase } from "./db";
import { readFileSync } from "node:fs";
import pg from "pg";

const runtime = process.env.GTM_TEST_RUNTIME!;
const runtimeMigrations = (JSON.parse(readFileSync(join(runtime, "drizzle-runtime/meta/_journal.json"), "utf8")) as { entries: unknown[] }).entries.length;

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
    assert.ok(["cache", "people", "companies", "profile_identifiers", "profile_runs", "profile_work", "profile_attempts", "profile_inputs", "gtm_viewer_grants", "provider_rate_limits"].every((name) => names.includes(`gtm.${name}`)));
    assert.deepEqual(names.filter((name) => name.startsWith("gtm.example") || /^public\.(cache|people|companies|profile_|gtm_viewer)/.test(name)), []);
  } finally { await database.close(); }
});

test("two builds migrating an empty database at once both succeed", { skip: process.env.GTM_TEST_SCRATCH === "1" }, async () => {
  const database = await testDatabase({ migrated: false });
  try {
    // Without a lock both read an empty journal and both run 0000; the second dies on CREATE SCHEMA "gtm".
    await Promise.all([migrate(database.unpooled), migrate(database.unpooled), migrate(database.unpooled)]);
    assert.equal((await database.query("SELECT count(*)::int AS n FROM drizzle.gtm_runtime_migrations")).rows[0].n, runtimeMigrations);
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
});

test("a preview build ignores database URLs; a local one uses DATABASE_URL, checked first", { skip: process.env.GTM_TEST_SCRATCH === "1" }, () => {
  const remote = { DATABASE_URL: "postgres://nobody:nothing@remote.invalid/db", DATABASE_URL_UNPOOLED: "postgres://nobody:nothing@remote.invalid/db" };
  const preview = commandLine({ ...remote, VERCEL: "1", VERCEL_ENV: "preview" });
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /skipping migrations/);
  // The production guard must reach the database before anything is migrated; an unreachable one fails the command.
  assert.notEqual(commandLine(remote).status, 0);
});

test("a workspace table may not take a runtime table's name", () => {
  assert.throws(() => mergeTables({ people: pgTable("my_people", { key: text("key").primaryKey() }) }), /reserved by the runtime/);
  assert.throws(() => mergeTables({ mine: pgTable("cache", { key: text("key").primaryKey() }) }), /cache is reserved by the runtime/);
  assert.ok("mine" in mergeTables({ mine: pgTable("mine", { key: text("key").primaryKey() }) }));
});

test("only a production build marks its database, and the guard matches that endpoint only", { skip: process.env.GTM_TEST_SCRATCH === "1" }, async () => {
  const database = await testDatabase();
  try {
    assert.equal(await isProductionDatabase(database.unpooled), false, "no marker table: not production");
    await migrate(database.unpooled);
    assert.equal(await isProductionDatabase(database.unpooled), false, "an ordinary migrate writes no marker");
    await migrate(database.unpooled, { production: true });
    assert.equal(await isProductionDatabase(database.unpooled), true);
    // A copy of production under another host (a Neon branch) is not production.
    const elsewhere = new URL(database.unpooled); elsewhere.hostname = "localhost";
    assert.equal(await isProductionDatabase(elsewhere.href), false);
    await database.query("DELETE FROM gtm.environment");
  } finally { await database.close(); }
});

test("a Neon URL with no production marker counts as production; a plain Postgres one does not", () => {
  assert.equal(neonHost("postgresql://u:p@ep-cool-1-pooler.us-east-1.aws.neon.tech/neondb"), true);
  assert.equal(neonHost("postgresql://u:p@127.0.0.1:5432/gtm"), false);
});

test("a migration older than the latest applied one fails instead of being skipped", { skip: process.env.GTM_TEST_SCRATCH === "1" }, async () => {
  const database = await testDatabase();
  const client = new pg.Client({ connectionString: database.unpooled });
  await client.connect();
  try {
    await checkFolder(client, "drizzle", "gtm_workspace_migrations");
    // Someone else's newer migration landed first: the journal's own entry is now behind it and not applied.
    await client.query("UPDATE drizzle.gtm_workspace_migrations SET created_at = created_at + 1000, hash = 'theirs'");
    await assert.rejects(checkFolder(client, "drizzle", "gtm_workspace_migrations"), /older than the latest applied migration/);
    await assert.rejects(migrate(database.unpooled), /older than the latest applied migration/);
  } finally { await client.end(); await database.close(); }
});

test("drops, renames, truncates and type changes are destructive; the shipped drop carries the opt-in", () => {
  assert.deepEqual(destructiveStatements(`CREATE TABLE "a" ("k" text);--> statement-breakpoint
ALTER TABLE "a" ADD COLUMN "b" text;
ALTER TABLE "a" ALTER COLUMN "b" DROP NOT NULL;
ALTER TABLE "a" DROP CONSTRAINT "c";
INSERT INTO "a" VALUES ('DROP TABLE x; RENAME');
-- DROP TABLE "a";`), []);
  for (const statement of ['DROP TABLE "a"', 'ALTER TABLE "a" DROP COLUMN "b"', 'ALTER TABLE a DROP b', 'ALTER TABLE "a" RENAME COLUMN "b" TO "c"', 'ALTER TABLE "a" RENAME TO "z"', 'TRUNCATE "a"', 'ALTER TABLE "a" ALTER COLUMN "b" SET DATA TYPE integer'])
    assert.deepEqual(destructiveStatements(`${statement};`), [statement], statement);
  assert.ok(readFileSync(join(runtime, "drizzle-runtime/0003_drop_raw_responses.sql"), "utf8").includes(DESTRUCTIVE_OPT_IN));
});
