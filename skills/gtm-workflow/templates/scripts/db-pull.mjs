// `npm run db:pull`: copy production's data down to this workspace's built-in local Postgres, replacing local data.
// Reads production only (a read-only session through the owner's own `neonctl` login); never writes it.
// Needs Postgres 18 client tools on PATH (`brew install libpq`, then add its bin folder to PATH): embedded-postgres
// ships no pg_dump or pg_restore, and pg_dump must be at least as new as Neon's server.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { LocalDatabaseError, endpointOf, ensureLocalDatabase } from "./local-database.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (command, args, env = process.env) => spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env, maxBuffer: 64 * 1024 * 1024 });

/** The client tools, version 18 or newer, or the reason they cannot be used. */
export function clientTools() {
  const version = run("pg_dump", ["--version"]);
  const major = Number(/\b(\d+)(?:\.\d+)?/.exec(version.stdout ?? "")?.[1]);
  if (version.status !== 0 || !(major >= 18) || run("pg_restore", ["--version"]).status !== 0)
    throw new LocalDatabaseError(`Copy-down needs pg_dump and pg_restore 18 or newer on PATH${major ? ` (found ${major})` : ""}: on macOS \`brew install libpq\` and add $(brew --prefix libpq)/bin to PATH.`);
  return { major };
}

const SCHEMAS = ["gtm", "drizzle", "public"];

/** Runs statements on `target` in one transaction. */
async function onTarget(target, statements) {
  const client = new pg.Client({ connectionString: target });
  client.on("error", () => {});
  await client.connect();
  try { await client.query(`BEGIN; ${statements.join("; ")}; COMMIT`); } finally { await client.end(); }
}

/**
 * Dump `source` read-only (schemas public, gtm and drizzle, the migration journal included so local migrations stay a
 * no-op; share-link secrets excluded) and restore it in place of `target`'s data. Local data is set aside, not
 * dropped, until the restore has succeeded, and comes back if it fails. Then settle what was in flight in production,
 * so local runs are never blocked by it and never settle production's provider jobs, and drop production's marker.
 * Returns the bytes transferred.
 */
export async function pullDatabase({ source, target, dumpFile }) {
  // A dump that has to wait for a table (a migration running) gives up rather than queue behind it.
  const dump = run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", "--lock-wait-timeout=10s", "--schema=public", "--schema=gtm", "--schema=drizzle",
    "--exclude-table-data=gtm.gtm_viewer_grants", `--file=${dumpFile}`, source], { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" });
  if (dump.status !== 0) throw new LocalDatabaseError(`pg_dump failed: ${dump.stderr.trim().split("\n").pop()}`);
  const bytes = statSync(dumpFile).size;
  const aside = (name) => `"${name}_before_pull"`;
  await onTarget(target, [...SCHEMAS.map((name) => `DROP SCHEMA IF EXISTS ${aside(name)} CASCADE`),
    ...SCHEMAS.map((name) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${name}') THEN ALTER SCHEMA "${name}" RENAME TO ${aside(name)}; END IF; END $$`)]);
  const restore = run("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", `--dbname=${target}`, dumpFile]);
  if (restore.status !== 0) {
    await onTarget(target, [...SCHEMAS.map((name) => `DROP SCHEMA IF EXISTS "${name}" CASCADE`),
      ...SCHEMAS.map((name) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${name}_before_pull') THEN ALTER SCHEMA ${aside(name)} RENAME TO "${name}"; END IF; END $$`)]);
    throw new LocalDatabaseError(`pg_restore failed, local data is as it was: ${restore.stderr.trim().split("\n").pop()}`);
  }
  await onTarget(target, SCHEMAS.map((name) => `DROP SCHEMA IF EXISTS ${aside(name)} CASCADE`));
  const settle = new pg.Client({ connectionString: target });
  settle.on("error", () => {});
  await settle.connect();
  try {
    await settle.query("DELETE FROM gtm.environment").catch((error) => { if (error.code !== "42P01") throw error; });
    await settle.query("UPDATE gtm.profile_runs SET state = 'cancelled' WHERE state = 'running'");
    await settle.query("UPDATE gtm.profile_attempts SET state = 'settled' WHERE state IN ('reserved', 'dispatched', 'uncertain')");
  } finally { await settle.end(); }
  return bytes;
}

/** Production's connection string from the owner's `neonctl` login, with the org and project that setup saved. */
function productionUrl() {
  const file = join(cwd, "data", "neon.json");
  if (!existsSync(file)) throw new LocalDatabaseError("No Neon project saved for this workspace: run the gtm-workflow skill's setup with --deploy once, from a computer signed in to neonctl.");
  const neon = JSON.parse(readFileSync(file, "utf8"));
  // The owner role by name: once another role exists (an import role, say) neonctl would ask which one.
  const result = run("neonctl", ["connection-string", "--project-id", neon.projectId, "--org-id", neon.orgId, "--role-name", "neondb_owner"]);
  if (result.status !== 0) throw new LocalDatabaseError("neonctl could not give the production connection: sign in with `neonctl auth`, then try again.");
  const url = result.stdout.trim();
  if (neon.endpoint && endpointOf(url) !== neon.endpoint) throw new LocalDatabaseError("neonctl answered for another endpoint than the one setup saved; run setup --deploy again.");
  return url;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dumpFile = join(cwd, "data", "pull.dump");
  let database;
  try {
    clientTools();
    const source = productionUrl();
    if (!process.argv.includes("--yes")) {
      const ask = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await ask.question("This replaces all local data with a copy of production. Continue? (y/N) ");
      ask.close();
      if (!/^y(es)?$/i.test(answer.trim())) { console.log("Nothing changed."); process.exit(0); }
    }
    // The built-in database only, and only while nothing else uses it: stop `npm run dev` first.
    database = await ensureLocalDatabase(cwd).catch((error) => {
      throw /^Already running/.test(error.message) ? new LocalDatabaseError("Stop npm run dev first; the copy replaces its database.") : error;
    });
    const bytes = await pullDatabase({ source, target: database.url, dumpFile });
    console.log(`Copied production to the local database (a ${(bytes / 1024 / 1024).toFixed(1)} MB compressed dump; Neon counts the uncompressed rows as data transfer). Start npm run dev.`);
    await rm(dumpFile, { force: true });
  } catch (error) {
    // The dump stays in data/ when it was made: `pg_restore` can be run on it by hand.
    console.error(error?.name === "LocalDatabaseError" ? error.message : error);
    process.exitCode = 1;
  } finally {
    await database?.stop();
  }
}
