// The local Postgres behind `npm run dev` and `npm run viewer`: real Postgres binaries from the workspace's
// embedded-postgres package, one server per workspace on data/pg, started and stopped by the launcher.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

/** Its message is written for the person at the terminal; the launcher prints it as is. */
export class LocalDatabaseError extends Error {
  constructor(message) { super(message); this.name = "LocalDatabaseError"; }
}
// The bootstrap superuser is used here alone, for set-up and repair; the app connects as the plain role. Loopback only.
export const SUPERUSER = { user: "postgres", password: "postgres" };
const DATABASE_VARIABLE = /^(?:DATABASE_URL|PG|POSTGRES_)/;

/** The one way out of the local database: GTM_DATABASE=external in the shell that runs the command, never in .env. */
export const externalDatabase = (shell = process.env) => shell.GTM_DATABASE === "external";

/**
 * A .env pulled from Vercel must never point a local run or a local migration at Neon: drop every database
 * variable from an environment the launcher built, then set the two the app reads.
 */
export function databaseEnvironment(environment, url, unpooled = url) {
  const result = Object.fromEntries(Object.entries(environment).filter(([name]) => !DATABASE_VARIABLE.test(name) && name !== "GTM_DATABASE"));
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
// A pid of 0 or less is never a process: signal 0 to pid 0 tests the caller's own process group and always succeeds.
const recordedPid = (file) => { try { const pid = Number(readFileSync(file, "utf8").trim()); return Number.isInteger(pid) && pid > 0 ? pid : 0; } catch { return 0; } };

/**
 * data/launcher.pid names the one launcher that owns this workspace's database. The claim appears atomically and
 * complete (a hard link to a finished file), so a file that is empty, unreadable or names a dead process is a
 * leftover. A leftover is moved aside, never deleted in place: if what was moved turns out to be a live claim made
 * in the same instant, it is put back.
 */
export function claimLauncher(file) {
  const running = new LocalDatabaseError(`Already running for this workspace (${file})`);
  const mine = `${file}.${process.pid}.claim`, aside = `${file}.${process.pid}.stale`;
  writeFileSync(mine, String(process.pid));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { linkSync(mine, file); return; } catch (error) { if (error.code !== "EEXIST") throw error; }
      const owner = recordedPid(file);
      if (owner === process.pid) return;
      if (owner && alive(owner)) throw running;
      try { renameSync(file, aside); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      const moved = recordedPid(aside);
      if (moved && moved !== process.pid && alive(moved)) {
        try { linkSync(aside, file); } catch { /* someone else claimed meanwhile */ }
        rmSync(aside, { force: true });
        throw running;
      }
      rmSync(aside, { force: true });
    }
    throw running;
  } finally { rmSync(mine, { force: true }); }
}

/** Starts the cluster in `directory` on a free loopback port; returns the port, or null when it did not start. */
export async function startCluster(tools, directory, log) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = await freePort();
    if (control(tools, ["start", "-D", directory, "-w", "-t", "60", "-l", log, "-o", `-p ${port}`])) return port;
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
  const script = join(workflowsDir, "scripts", "local-database.mjs");
  if (!existsSync(script)) throw new LocalDatabaseError("This workspace is from before the Postgres runtime (it has no scripts/local-database.mjs), which this version does not convert");
  const local = await import(pathToFileURL(script));
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
