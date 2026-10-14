// `npm run dev`, the one local command: this workspace's own Postgres, migrations, the viewer registry and the Nitro
// dev server with workflows, viewer and Keys page, all local. Keys and settings come from `.env` and `.env.local` like any Vercel app.
import { createRequire } from "node:module";
import { readFileSync, watch } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { removeStudioShare } from "./studio-share.mjs";
import { LocalDatabaseError, databaseEnvironment, ensureLocalDatabase, isProductionDatabase } from "./local-database.mjs";
import { LOADED_KEYS, SHELL_KEYS, keysFingerprint, providerVariable, reloadableKeys } from "../lib/local-keys.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PRODUCTION_ONLY = ["GTM_AGENT_URL", "GTM_NOTIFY_SECRET", "GTM_WORKFLOW_URL", "GTM_RUN_SECRET"];

/**
 * The environment a local process gets: the shell over `.env.local` over `.env`, as Vercel's own tools order them.
 * `vercel env pull` writes Vercel's system variables into `.env.local` (VERCEL=1, VERCEL_ENV, empty VERCEL_GIT_*, …);
 * the template reads `VERCEL` as "running on Vercel", so every VERCEL_* goes except the OIDC token the AI Gateway uses.
 */
export function localEnvironment(dir = cwd, shell = process.env, warn = console.warn) {
  const files = {};
  for (const name of [".env", ".env.local"]) {
    let values;
    try { values = parseEnv(readFileSync(join(dir, name), "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; continue; }
    // Production's wiring and retired names from older setups: a local run would post to real Slack through the
    // production agent, so they are never loaded, and never silently.
    const dropped = Object.keys(values).filter((key) => PRODUCTION_ONLY.includes(key));
    if (dropped.length) warn(`Not loaded from workflows/${name}: ${dropped.join(", ")} (production only or retired; delete them from the file)`);
    for (const key of dropped) delete values[key];
    Object.assign(files, values);
  }
  const merged = { ...files, ...shell };
  for (const name of Object.keys(merged)) if (name.startsWith("VERCEL") && name !== "VERCEL_OIDC_TOKEN") delete merged[name];
  return merged;
}

/** Build, migration and inspection children get no keys: nothing they do needs one. */
const withoutKeys = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)));

export async function launch(options = {}) {
  const shell = { ...process.env };
  const env = localEnvironment();
  // node-postgres takes PG* from the environment as defaults; the built-in database gets every field passed explicitly.
  for (const name of Object.keys(process.env)) if (/^PG/.test(name)) delete process.env[name];
  process.chdir(cwd);
  // DATABASE_URL set locally (a Neon development branch pulled with `vercel env pull`, say) is used as it is; otherwise
  // this workspace's own built-in Postgres. Either way production's database is refused.
  const database = env.DATABASE_URL
    ? { url: env.DATABASE_URL, unpooled: env.DATABASE_URL_UNPOOLED || env.DATABASE_URL, async stop() {}, stopNow() {} }
    : await ensureLocalDatabase(cwd);
  try {
    if (await isProductionDatabase(database.unpooled ?? database.url)) throw new LocalDatabaseError("DATABASE_URL points at the production database, or at a Neon database with no production marker yet (before production's first build nothing proves it is not production's). Local work never runs against it: remove it from .env.local (in Vercel, untick Development for the production database in the Neon integration).");
    // Only DATABASE_URL and DATABASE_URL_UNPOOLED reach the app; PG* and POSTGRES_* from a pulled file never do.
    const runtime = databaseEnvironment(env, database.url, database.unpooled ?? database.url);
    const run = (args) => {
      const result = spawnSync(process.execPath, args, { cwd, env: withoutKeys(runtime), stdio: "inherit" });
      if (result.status !== 0) throw new LocalDatabaseError(`${args[0]} failed`);
    };
    run(["scripts/build-viewer.mjs"]);
    run(["scripts/migrate.mjs"]);
    const port = Number(env.GTM_RUNTIME_PORT ?? 3939);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new LocalDatabaseError("Set GTM_RUNTIME_PORT to a port number");
    // The local queue's 15-minute transport timeout, and runs left in flight by a stop resume at the next start.
    Object.assign(runtime, { WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS: "900000", WORKFLOW_LOCAL_BODY_TIMEOUT_MS: "900000", WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "true" });
    // A key the shell supplies wins over both files, as at start: a reload never changes it, and the Keys page says so.
    const pinned = Object.keys(shell).filter((name) => providerVariable(name)).sort();
    let keys = reloadableKeys(cwd, pinned);
    runtime[LOADED_KEYS] = keysFingerprint(keys);
    runtime[SHELL_KEYS] = pinned.join(",");
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, runtime);
    const server = await (options.serve ?? nitroServer)({ cwd, port });
    console.log(JSON.stringify({ status: "runner_started", origin: `http://127.0.0.1:${port}` }));
    const watcher = watchKeys(cwd, () => {
      let next;
      // A file mid-edit by hand is read again at its next change.
      try { next = reloadableKeys(cwd, pinned); } catch { return; }
      const fingerprint = keysFingerprint(next);
      if (fingerprint === process.env[LOADED_KEYS]) return;
      for (const name of new Set([...Object.keys(keys), ...Object.keys(next)])) {
        if (name in next) process.env[name] = next[name];
        else delete process.env[name];
      }
      keys = next;
      process.env[LOADED_KEYS] = fingerprint;
      server.reload?.();
      console.log(JSON.stringify({ status: "keys_reloaded" }));
    });
    let closing;
    const close = () => (closing ??= (async () => { watcher.close(); removeStudioShare(cwd); await Promise.resolve(server.close()).catch(() => {}); await database.stop(); })());
    // `on`, not `once`: under `npm run dev` Ctrl+C arrives twice (from the terminal and forwarded by npm), and a second
    // signal with no listener left would kill the process half way through stopping the database. SIGHUP is a closed terminal.
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => { close().then(() => process.exit(0), () => process.exit(1)); });
    process.on("exit", () => { removeStudioShare(cwd); database.stopNow?.(); });
    return { origin: `http://127.0.0.1:${port}`, close };
  } catch (error) { await database.stop(); throw error; }
}

/**
 * A saved key is used without a restart, as a production save redeploys: when `.env` or `.env.local` changes (the Keys
 * page, an agent, `vercel env pull`), the launcher takes the new keys into its own environment and starts a fresh
 * server worker from it, the way a saved code file does. A key the shell supplies still wins (`GTM_LOCAL_SHELL_KEYS` names
 * them for the Keys page, which says a saved one is not in use); settings other than keys (the
 * database, the port, tailnet mode) still take a restart. Runs in flight resume on the new worker.
 */
function watchKeys(dir, changed) {
  let timer;
  const watcher = watch(dir, { persistent: false }, (_event, name) => {
    if (name && ![".env", ".env.local"].includes(String(name))) return;
    clearTimeout(timer);
    timer = setTimeout(changed, 150);
  });
  watcher.on("error", () => {});
  return { close() { clearTimeout(timer); watcher.close(); } };
}

async function nitroServer({ cwd, port }) {
  const require = createRequire(join(cwd, "package.json"));
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  // Pinned Nitro's own CLI uses this dev server. dotenv stays off: it would read `.env.local` again, VERCEL=1 included.
  const { NitroDevServer } = await import(pathToFileURL(join(dirname(require.resolve("nitro/package.json")), "dist/_dev.mjs")));
  let nitro, server;
  async function reload() {
    if (nitro) { await nitro.options._c12.unwatch?.(); await nitro.close(); }
    nitro = await createNitro({ rootDir: cwd, dev: true, _cli: { command: "dev" } }, { dotenv: false, watch: true, c12: { onUpdate: reload } });
    nitro.hooks.hookOnce("restart", reload);
    server = new NitroDevServer(nitro);
    await server.listen({ port, hostname: "127.0.0.1" });
    await prepare(nitro); await build(nitro);
  }
  await reload();
  // A fresh worker over the same build, with this process's environment as it is now: requests wait for it.
  return { close: () => nitro.close(), reload: () => server.reload() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch().catch((error) => {
    console.error(error?.name === "LocalDatabaseError" ? error.message : error);
    process.exitCode = 1;
  });
}
