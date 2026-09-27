// This workspace's local Postgres: real Postgres binaries from the workspace's embedded-postgres package, one server
// per workspace on data/pg, started and stopped by the launcher (scripts/local-launch.mjs). Every other local script
// gets the URL from here.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, linkSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
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


/** Its message is written for the person at the terminal; the launcher prints it as is. */
export class LocalDatabaseError extends Error {
  constructor(message) { super(message); this.name = "LocalDatabaseError"; }
}
// The bootstrap superuser is used here alone, for set-up and repair; the app connects as the plain role. Loopback only.
export const SUPERUSER = { user: "postgres", password: "postgres" };
const DATABASE_VARIABLE = /^(?:DATABASE_URL|PG|POSTGRES_)/;

/** Drop every database variable from an environment the launcher built, then set the two the app reads. */
export function databaseEnvironment(environment, url, unpooled = url) {
  const result = Object.fromEntries(Object.entries(environment).filter(([name]) => !DATABASE_VARIABLE.test(name)));
  return { ...result, DATABASE_URL: url, DATABASE_URL_UNPOOLED: unpooled };
}

/** initdb, pg_ctl and postgres from the embedded-postgres package installed in this workflows folder. */
export async function postgresTools(workflowsDir) {
  const require = createRequire(join(workflowsDir, "package.json"));
  let entry;
  try {
    const system = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
    entry = createRequire(require.resolve("embedded-postgres")).resolve(`@embedded-postgres/${system}`);
  } catch { throw new LocalDatabaseError("The local database is not installed: run `npm install` in workflows/"); }
  // The package links its libraries in a postinstall script, which `npm ci --ignore-scripts` skips. Same links, made here.
  const home = dirname(dirname(entry));
  let links = [];
  try { links = JSON.parse(readFileSync(join(home, "native", "pg-symlinks.json"), "utf8")); } catch { /* none on this system */ }
  for (const { source, target } of links) {
    const path = join(home, target);
    if (!existsSync(path)) try { symlinkSync(relative(dirname(path), join(home, source)), path); } catch { /* made by another process */ }
  }
  return import(pathToFileURL(entry));
}

// Windows: the server inherits pg_ctl's handles, so a piped call never returns. pg_ctl also drops administrator
// rights, which postgres itself refuses to run with; that is why the server is never spawned directly.
const control = (tools, args) => spawnSync(tools.pg_ctl, args, { stdio: "ignore", timeout: 120_000 }).status === 0;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
}
function isPostgres(pid) {
  const result = process.platform === "win32"
    ? spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" })
    : spawnSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" });
  return result.status !== 0 || /postgres/i.test(result.stdout ?? "");
}
// Launchers are Node processes. After a crash and a reboot the recorded pid can belong to anything else.
function isNode(pid) {
  const result = process.platform === "win32"
    ? spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" })
    : spawnSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8" });
  return result.status !== 0 || /node/i.test(result.stdout ?? "");
}
// A pid of 0 or less is never a process: signal 0 to pid 0 tests the caller's own process group and always succeeds.
const recordedPid = (file, missing = 0) => { try { const pid = Number(readFileSync(file, "utf8").trim()); return Number.isInteger(pid) && pid > 0 ? pid : 0; } catch (error) { return error.code === "ENOENT" ? missing : 0; } };

/**
 * data/launcher.pid names the one launcher that owns this workspace's database. The claim appears atomically and
 * complete (a hard link to a finished file), so a file that is empty, unreadable or names a dead process is a
 * leftover. Judging a leftover and removing it are two steps, and by the second the name may hold another launcher's
 * fresh claim. So only the holder of `<file>.takeover` removes a leftover, and only one it has read while holding it:
 * a claim is never linked over a file that exists, so that leftover stays what it was read as. A missing file is
 * never "removed", because a claim can appear there at any instant. The takeover file is claimed the same way, which
 * clears one left by a launcher killed while it held it.
 */
export function claimLauncher(file) {
  if (!claimed(file)) throw new LocalDatabaseError(`Already running for this workspace (${file})`);
}
function claimed(file) {
  const mine = `${file}.${process.pid}.claim`, aside = `${file}.${process.pid}.stale`, takeover = `${file}.takeover`;
  const live = (owner) => owner > 0 && owner !== process.pid && alive(owner) && isNode(owner);
  writeFileSync(mine, String(process.pid));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { linkSync(mine, file); return true; } catch (error) { if (error.code !== "EEXIST") throw error; }
      const owner = recordedPid(file);
      if (owner === process.pid) return true;
      // A live holder of the takeover file is about to claim: that launcher is the one running.
      if (live(owner) || !claimed(takeover)) return false;
      try {
        const left = recordedPid(file, null);
        if (live(left)) return false;
        if (left !== null) { renameSync(file, aside); rmSync(aside, { force: true }); }
      } finally { rmSync(takeover, { force: true }); }
    }
    return false;
  } finally { rmSync(mine, { force: true }); }
}

/**
 * Server settings for a throwaway local cluster, passed at every start so clusters made by earlier versions get them
 * too. Durability against a crash of the machine costs a disk sync per commit and the WAL for replication; a dev
 * database that is rebuilt from its migrations and imports needs neither, and an enrichment run commits twice per item.
 * Never for Neon: nothing here reaches a deployed database.
 */
export const LOCAL_SERVER_OPTIONS = ["fsync=off", "synchronous_commit=off", "full_page_writes=off", "wal_level=minimal", "max_wal_senders=0"];

/** Starts the cluster in `directory` on a free loopback port; returns the port, or null when it did not start. */
export async function startCluster(tools, directory, log) {
  const options = LOCAL_SERVER_OPTIONS.map((setting) => `-c ${setting}`).join(" ");
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = await freePort();
    if (control(tools, ["start", "-D", directory, "-w", "-t", "60", "-l", log, "-o", `-p ${port} ${options}`])) return port;
  }
  return null;
}
/** Only for a server whose folder was proven: pg_ctl signals whatever process id the folder's pid file names. */
export const stopCluster = (tools, directory) => control(tools, ["stop", "-D", directory, "-m", "fast", "-w", "-t", "30"]);
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

export function createCluster(tools, directory) {
  const passwordFile = join(dirname(directory), `.pg-bootstrap-${process.pid}`);
  writeFileSync(passwordFile, `${SUPERUSER.password}\n`, { mode: 0o600 });
  try {
    // The builtin C.UTF-8 locale sorts by code point on every system, as Neon's default does.
    const result = spawnSync(tools.initdb, [`--pgdata=${directory}`, `--username=${SUPERUSER.user}`, `--pwfile=${passwordFile}`, "--auth=scram-sha-256",
      "--encoding=UTF8", "--locale-provider=builtin", "--builtin-locale=C.UTF-8", "--locale=C"], { stdio: "ignore", timeout: 120_000 });
    if (result.status !== 0) throw new LocalDatabaseError(`Could not create the local database in ${directory}. Postgres does not run as root.`);
  } finally { rmSync(passwordFile, { force: true }); }
  appendFileSync(join(directory, "postgresql.conf"), "\n# gtm: loopback only, no socket files\nlisten_addresses = '127.0.0.1'\nunix_socket_directories = ''\n");
}

/**
 * Makes sure this workspace's Postgres is up and returns its URL and a stop function.
 * No process is signalled and no server adopted unless the folder check proved it serves this workspace's data/pg.
 */
export async function ensureLocalDatabase(workflowsDir, { create = true } = {}) {
  const local = { dataDirectory, provenPort, recorded, ensureAppRole, urlForPort };
  const directory = local.dataDirectory(workflowsDir), data = dirname(directory);
  const launcherFile = join(data, "launcher.pid"), serverFile = join(directory, "postmaster.pid"), log = join(data, "postgres.log");
  if (!create && !existsSync(join(directory, "PG_VERSION"))) throw new LocalDatabaseError("No local database yet: run `npm run dev` once first");
  mkdirSync(data, { recursive: true });

  claimLauncher(launcherFile);

  try {
    const tools = await postgresTools(workflowsDir);
    // A crashed launcher leaves its server running. The plain role proves it; the superuser covers a crash before the role existed.
    const proven = async () => await local.provenPort(workflowsDir) ?? await local.provenPort(workflowsDir, { ...SUPERUSER, database: "postgres" });
    let port = await proven();
    const left = port ? null : local.recorded(workflowsDir);
    if (left && alive(left.pid) && isPostgres(left.pid)) {
      // Perhaps this folder's server, still starting or stopping. Wait for an answer; never touch the process.
      for (let attempt = 0; attempt < 20 && !port; attempt++) { await new Promise((resolve) => setTimeout(resolve, 500)); port = await proven(); }
      if (!port && existsSync(serverFile)) throw new LocalDatabaseError(`${serverFile} names a running Postgres (process ${left.pid}) that does not answer for this folder. If no database is running for this workspace, delete that file and start again.`);
    } else if (left) rmSync(serverFile, { force: true }); // Stale by proof. Postgres refuses to start over a pid file whose process id is alive.
    if (!port) {
      if (!existsSync(join(directory, "PG_VERSION"))) createCluster(tools, directory);
      port = await startCluster(tools, directory, log);
      if (!port) throw new LocalDatabaseError(`The local database did not start; see ${log}`);
    }
    // After every start, so a crash between creating the folder and creating the role heals itself.
    await local.ensureAppRole(port, SUPERUSER);
    // Last look before anything is served: only the launcher named in the file may later stop the server.
    if (recordedPid(launcherFile) !== process.pid) throw new LocalDatabaseError(`Already running for this workspace (${launcherFile})`);
    // The postmaster proven just now. The exit fallback below may stop this process id and no other.
    const postmaster = local.recorded(workflowsDir)?.pid;
    let stopping, done = false;
    const release = () => { done = true; if (recordedPid(launcherFile) === process.pid) rmSync(launcherFile, { force: true }); };
    return {
      url: local.urlForPort(port),
      stop() {
        return (stopping ??= (async () => {
          if (done) return;
          if (await proven()) stopCluster(tools, directory);
          release();
        })());
      },
      /** For the process's exit event, where nothing asynchronous runs: something ended the process before stop() finished. */
      stopNow() {
        if (done) return;
        if (postmaster && local.recorded(workflowsDir)?.pid === postmaster) stopCluster(tools, directory);
        release();
      },
    };
  } catch (error) { if (recordedPid(launcherFile) === process.pid) rmSync(launcherFile, { force: true }); throw error; }
}

/** The Neon endpoint id in a connection URL's host (`ep-x-1` from `ep-x-1-pooler.<region>.aws.neon.tech`). */
export const endpointOf = (url) => new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");

/** A Neon host (`ep-x-1[-pooler].<region>.aws.neon.tech`): the kind of database `vercel env pull` brings down. */
export const neonHost = (url) => /\.neon\.tech$/i.test(new URL(url).hostname);

/**
 * The production guard. The production build writes one marker row naming its own endpoint (scripts/migrate.mjs);
 * a database is production when that row is there and names the host being connected to. A Neon branch copied or
 * reset from production carries the row under another host, so a development branch passes. A Neon database with no
 * marker at all counts as production: before the first production build nothing proves a pulled URL is not
 * production's own. Another database with no marker (your own Postgres) is not production. A database that cannot be
 * reached is an error, never a pass.
 */
export async function isProductionDatabase(url) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  await client.connect();
  try {
    const { rows } = await client.query("SELECT endpoint FROM gtm.environment WHERE name = 'production'");
    return rows.length === 0 ? neonHost(url) : rows.some((row) => row.endpoint === endpointOf(url));
  } catch (error) {
    if (["42P01", "3F000"].includes(error.code)) return neonHost(url); // no table, no schema
    throw error;
  } finally { await client.end().catch(() => {}); }
}
