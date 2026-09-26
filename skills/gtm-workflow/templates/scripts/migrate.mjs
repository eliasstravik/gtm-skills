// The only migration step: runtime tables (drizzle-runtime/, schema gtm) and workspace tables (drizzle/, schema public).
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as applyFolder } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { endpointOf, isProductionDatabase, localDatabaseUrl } from "./local-database.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATE_LOCK_KEY = 7462; // the app locks by hashed names, never by this number
const CONNECT_NEON = "No DATABASE_URL: connect Neon to this project through the Vercel integration";

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
    const db = drizzle(client);
    for (const [folder, journal] of [["drizzle-runtime", "gtm_runtime_migrations"], ["drizzle", "gtm_workspace_migrations"]]) {
      if (!existsSync(join(root, folder, "meta", "_journal.json"))) continue;
      await applyFolder(db, { migrationsFolder: join(root, folder), migrationsSchema: "drizzle", migrationsTable: journal });
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
