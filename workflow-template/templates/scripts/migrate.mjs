// The only migration step: runtime tables (drizzle-runtime/, schema gtm) and workspace tables (drizzle/, schema public).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as applyFolder } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { endpointOf, isProductionDatabase, localDatabaseUrl } from "./local-database.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATE_LOCK_KEY = 7462; // the app locks by hashed names, never by this number
const CONNECT_NEON = "No DATABASE_URL: connect Neon to this project through the Vercel integration";

/** A migration file opts in to dropping or renaming with this line, once the code that needed the old shape is gone. */
export const DESTRUCTIVE_OPT_IN = "-- gtm: destructive";

/** Statements that remove or rename what the code still serving (or a rollback) reads: drops, renames, truncates, type changes. */
export function destructiveStatements(text) {
  return text.split(/;|--> statement-breakpoint/).map((part) => part.replace(/--[^\n]*/g, "").trim()).filter((statement) =>
    /^DROP\s+(?:TABLE|SCHEMA|VIEW|MATERIALIZED\s+VIEW|TYPE|SEQUENCE)\b/i.test(statement) || /^TRUNCATE\b/i.test(statement) ||
    (/^ALTER\s+(?:TABLE|SCHEMA|VIEW|MATERIALIZED\s+VIEW|TYPE|SEQUENCE)\b/i.test(statement) && (/\bRENAME\b/i.test(statement) ||
      /\bDROP\s+(?!CONSTRAINT\b|DEFAULT\b|NOT\s+NULL\b|IDENTITY\b|EXPRESSION\b)/i.test(statement) ||
      /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i.test(statement))));
}

/**
 * What drizzle would do silently, refused before anything runs. drizzle applies only files newer than the latest one
 * applied, so a file older than that (two people generating at once, the older one pushed second) would be skipped
 * for good. And in production, a drop or rename runs while the previous deployment still serves: it needs the opt-in.
 */
export async function checkFolder(client, folder, journal, { production = false } = {}) {
  const { entries } = JSON.parse(readFileSync(join(root, folder, "meta", "_journal.json"), "utf8"));
  const applied = await client.query(`SELECT created_at FROM drizzle."${journal}"`).then(
    (result) => new Set(result.rows.map((row) => Number(row.created_at))),
    (error) => { if (["42P01", "3F000"].includes(error.code)) return new Set(); throw error; });
  const latest = Math.max(0, ...applied);
  for (const entry of entries) {
    if (applied.has(entry.when)) continue;
    const file = `${folder}/${entry.tag}.sql`;
    if (entry.when <= latest)
      throw new Error(`${file} is older than the latest applied migration, so it would never run. Regenerate it: delete the file, its snapshot and its journal entry, then npm run db:generate`);
    const text = readFileSync(join(root, file), "utf8");
    // A fresh database has no earlier code relying on it; locally nothing else is serving.
    if (production && latest > 0 && !text.includes(DESTRUCTIVE_OPT_IN) && destructiveStatements(text).length)
      throw new Error(`${file} drops or renames something while the current deployment still uses it: ${destructiveStatements(text)[0].slice(0, 120)}. Ship the code that stops using it first, then add the line "${DESTRUCTIVE_OPT_IN}" to the file`);
  }
}

/** Migrations only add; a backfill is a migration; nothing that scans a table runs on every build. */
export async function migrate(url, { production = false } = {}) {
  console.log(`Migrating database on ${new URL(url).host}`);
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  await client.connect();
  // Two builds at once would both read an empty journal and both run 0000. A session lock makes the second wait and
  // then find nothing to do. Behind a transaction-mode pooler a session lock could stay on a server connection, so
  // there it is skipped; migrations are meant for the unpooled URL.
  const pooled = new URL(url).hostname.split(".")[0].endsWith("-pooler");
  if (pooled) console.log("This is a pooled URL: concurrent migrations are not serialised. Use DATABASE_URL_UNPOOLED.");
  try {
    if (!pooled) await client.query("SELECT pg_advisory_lock($1)", [MIGRATE_LOCK_KEY]);
    // Workspace migrations name tables without a schema. The local role is called gtm like the runtime schema, and
    // Postgres looks in a schema named after the role first, so pin the path or those tables land in gtm locally.
    await client.query("SET search_path TO public");
    // A migration waiting for a table (behind a long read such as db:pull's dump) makes every later query on that table
    // wait behind it; a short limit makes it give up and try again instead of stalling production.
    await client.query("SET lock_timeout = '10s'");
    const db = drizzle(client);
    const folders = [["drizzle-runtime", "gtm_runtime_migrations"], ["drizzle", "gtm_workspace_migrations"]].filter(([folder]) => existsSync(join(root, folder, "meta", "_journal.json")));
    for (const [folder, journal] of folders) await checkFolder(client, folder, journal, { production });
    for (const [folder, journal] of folders)
      for (let attempt = 1; ; attempt++) {
        try { await applyFolder(db, { migrationsFolder: join(root, folder), migrationsSchema: "drizzle", migrationsTable: journal }); break; }
        catch (error) {
          if ((error.code ?? error.cause?.code) !== "55P03" || attempt >= 3) throw error;
          console.log(`A table is busy; trying ${folder} again`);
          await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
        }
      }
    // The production marker the local launcher, doctor and the Keys page look for before touching a database
    // (isProductionDatabase in local-database.mjs). Only a production build writes it, naming its own endpoint.
    if (production) {
      await client.query("CREATE SCHEMA IF NOT EXISTS gtm");
      await client.query("CREATE TABLE IF NOT EXISTS gtm.environment (name text PRIMARY KEY, endpoint text NOT NULL)");
      await client.query("INSERT INTO gtm.environment (name, endpoint) VALUES ('production', $1) ON CONFLICT (name) DO UPDATE SET endpoint = excluded.endpoint", [endpointOf(url)]);
    }
  } finally {
    // Ending the session releases the lock too; the explicit unlock is for the orderly case.
    if (!pooled) await client.query("SELECT pg_advisory_unlock($1)", [MIGRATE_LOCK_KEY]).catch(() => {});
    await client.end().catch(() => {});
  }
}

/**
 * Production builds migrate the project's database; preview builds nothing. Locally (npm run dev, npm run build):
 * DATABASE_URL when the environment sets it, else this workspace's running built-in Postgres; never production's.
 */
async function commandLineTarget() {
  const remote = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (process.env.VERCEL_ENV === "production") {
    if (!remote) throw new Error(CONNECT_NEON);
    return remote;
  }
  if (process.env.VERCEL) return null;
  if (!remote) return localDatabaseUrl(root).catch(() => null);
  if (await isProductionDatabase(remote)) throw new Error("DATABASE_URL points at the production database; local migrations never run against it");
  return remote;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const url = await commandLineTarget();
    if (url) await migrate(url, { production: process.env.VERCEL_ENV === "production" });
    else console.log("No database for this build: skipping migrations");
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  }
}
