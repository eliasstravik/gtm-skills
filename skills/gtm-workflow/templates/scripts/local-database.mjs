// The one source of this workspace's local database URL. The launcher starts the server; every other local script asks here.
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import pg from "pg";

// Fixed on purpose: the server listens on 127.0.0.1 only and local use is one person, so a secret would protect nothing.
const APP = { user: "gtm", password: "gtm", database: "gtm" };
const START_FIRST = "No local database is running for this workspace: start `npm run dev` first";

export const dataDirectory = (workflowsDir = ".") => join(resolve(workflowsDir), "data", "pg");

/** Postgres writes postmaster.pid itself: line 1 is its process id, line 4 its port. */
export function recorded(workflowsDir = ".") {
  try {
    const lines = readFileSync(join(dataDirectory(workflowsDir), "postmaster.pid"), "utf8").split(/\r?\n/);
    const pid = Number(lines[0]), port = Number(lines[3]);
    return Number.isInteger(pid) && pid > 0 && Number.isInteger(port) && port > 0 ? { pid, port } : null;
  } catch { return null; }
}

// macOS maps /tmp to /private/tmp; Windows reports forward slashes, short names and any case.
function samePath(a, b) {
  const real = (path) => { const value = realpathSync.native(path); return process.platform === "win32" ? value.toLowerCase() : value; };
  try { return real(a) === real(b); } catch { return false; }
}

/**
 * A pid file can lie after a crash or reboot: its port may now belong to another workspace's server. So ask the
 * server on that port which folder it serves. Returns the port only when it is this workspace's data/pg.
 */
export async function provenPort(workflowsDir = ".", credentials = APP) {
  const port = recorded(workflowsDir)?.port;
  if (!port) return null;
  const client = new pg.Client({ host: "127.0.0.1", port, ...credentials, ssl: false, connectionTimeoutMillis: 3000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const folder = (await client.query("SHOW data_directory")).rows[0].data_directory;
    return samePath(folder, dataDirectory(workflowsDir)) ? port : null;
  } catch { return null; }
  finally { await client.end().catch(() => {}); }
}

export const urlForPort = (port) => `postgres://${APP.user}:${APP.password}@127.0.0.1:${port}/${APP.database}?sslmode=disable`;

/** The URL of this workspace's running local database, or an error saying how to start it. */
export async function localDatabaseUrl(workflowsDir = ".") {
  const port = await provenPort(workflowsDir);
  if (!port) throw new Error(START_FIRST);
  return urlForPort(port);
}

/** Launcher only: as the bootstrap superuser, make sure the app's role, its one grant and its database exist. */
export async function ensureAppRole(port, superuser) {
  const client = new pg.Client({ host: "127.0.0.1", port, ...superuser, database: "postgres", ssl: false, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  await client.connect();
  try {
    if (!(await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP.user])).rowCount)
      await client.query(`CREATE ROLE ${APP.user} LOGIN NOSUPERUSER PASSWORD '${APP.password}'`);
    // Lets the role read data_directory for the folder check, and nothing else of note.
    await client.query(`GRANT pg_read_all_settings TO ${APP.user}`);
    if (!(await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [APP.database])).rowCount)
      await client.query(`CREATE DATABASE ${APP.database} OWNER ${APP.user}`);
  } finally { await client.end().catch(() => {}); }
}
