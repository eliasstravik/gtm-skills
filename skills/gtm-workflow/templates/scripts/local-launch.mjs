// `npm run dev`, the one local command: this workspace's own Postgres, migrations, the viewer registry and the Nitro
// dev server with workflows, viewer and Keys page, all local. Keys and settings come from `.env` and `.env.local` like any Vercel app.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { LocalDatabaseError, databaseEnvironment, ensureLocalDatabase, isProductionDatabase } from "./local-database.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The environment a local process gets: the shell over `.env.local` over `.env`, as Vercel's own tools order them.
 * `vercel env pull` writes Vercel's system variables into `.env.local` (VERCEL=1, VERCEL_ENV, empty VERCEL_GIT_*, …);
 * the template reads `VERCEL` as "running on Vercel", so every VERCEL_* goes except the OIDC token the AI Gateway uses.
 */
export function localEnvironment(dir = cwd, shell = process.env) {
  const files = {};
  for (const name of [".env", ".env.local"]) {
    try { Object.assign(files, parseEnv(readFileSync(join(dir, name), "utf8"))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const merged = { ...files, ...shell };
  for (const name of Object.keys(merged)) if (name.startsWith("VERCEL") && name !== "VERCEL_OIDC_TOKEN") delete merged[name];
  return merged;
}

/** Build, migration and inspection children get no keys: nothing they do needs one. */
const withoutKeys = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => !/(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)));

export async function launch(options = {}) {
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
    if (await isProductionDatabase(database.unpooled ?? database.url)) throw new LocalDatabaseError("DATABASE_URL points at the production database. Local work never runs against it: remove it from .env.local (in Vercel, untick Development for the production database in the Neon integration).");
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
    for (const name of Object.keys(process.env)) delete process.env[name];
    Object.assign(process.env, runtime);
    const server = await (options.serve ?? nitroServer)({ cwd, port });
    console.log(JSON.stringify({ status: "runner_started", origin: `http://127.0.0.1:${port}` }));
    let closing;
    const close = () => (closing ??= (async () => { await Promise.resolve(server.close()).catch(() => {}); await database.stop(); })());
    // `on`, not `once`: under `npm run dev` Ctrl+C arrives twice (from the terminal and forwarded by npm), and a second
    // signal with no listener left would kill the process half way through stopping the database. SIGHUP is a closed terminal.
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => { close().then(() => process.exit(0), () => process.exit(1)); });
    process.on("exit", () => database.stopNow?.());
    return { origin: `http://127.0.0.1:${port}`, close };
  } catch (error) { await database.stop(); throw error; }
}

async function nitroServer({ cwd, port }) {
  const require = createRequire(join(cwd, "package.json"));
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  // Pinned Nitro's own CLI uses this dev server. dotenv stays off: it would read `.env.local` again, VERCEL=1 included.
  const { NitroDevServer } = await import(pathToFileURL(join(dirname(require.resolve("nitro/package.json")), "dist/_dev.mjs")));
  let nitro;
  async function reload() {
    if (nitro) { await nitro.options._c12.unwatch?.(); await nitro.close(); }
    nitro = await createNitro({ rootDir: cwd, dev: true, _cli: { command: "dev" } }, { dotenv: false, watch: true, c12: { onUpdate: reload } });
    nitro.hooks.hookOnce("restart", reload);
    await new NitroDevServer(nitro).listen({ port, hostname: "127.0.0.1" });
    await prepare(nitro); await build(nitro);
  }
  await reload();
  return { close: () => nitro.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch().catch((error) => {
    console.error(error?.name === "LocalDatabaseError" ? error.message : error);
    process.exitCode = 1;
  });
}
