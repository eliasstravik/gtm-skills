import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workspaceState, privateJson, writePrivateJson } from "./state.mjs";
import { openJournal } from "../src/journal.mjs";
import { nativeStore, settings, inspectionEnvironment, runtimeEnvironment } from "./storage.mjs";
import { requireThat } from "../src/errors.mjs";
import { ensureLocalDatabase, databaseEnvironment, externalDatabase, LocalDatabaseError } from "./database.mjs";
export { ensureLocalDatabase };
// `options` exists for the launcher tests: private state outside the home folder, a stand-in credential store and a stub server.
export async function launch(workspace, mode = "dev", options = {}) {
  requireThat(!process.env.VERCEL, "local_only");
  const state = await workspaceState(workspace, options.stateOptions), config = await privateJson(state.configPath), cwd = join(state.workspace, "workflows");
  // Read from the shell before anything from .env is merged in: .env can never choose an external database.
  const external = externalDatabase(process.env), shell = { url: process.env.DATABASE_URL, unpooled: process.env.DATABASE_URL_UNPOOLED };
  if (external && !shell.url) throw new LocalDatabaseError("GTM_DATABASE=external needs DATABASE_URL set in this shell, not in .env");
  // The external way out starts nothing and never migrates; migrating that database is an explicit `node scripts/migrate.mjs`.
  const database = external ? { url: shell.url, unpooled: shell.unpooled ?? shell.url, async stop() {} } : await ensureLocalDatabase(cwd, { create: mode === "dev" });
  if (external) console.error(`Using the external database on ${new URL(shell.url).host}; it is not migrated from here`);
  try { return await serve(); } catch (error) { await database.stop(); throw error; }
  async function serve() {
  const journal = await openJournal({ url: `file:${state.database}` });
  const store = options.store ?? nativeStore(state.id), environment = await settings(state.workspace);
  const clean = databaseEnvironment({ ...inspectionEnvironment(environment, (await journal.list()).map((row) => row.variable)), GTM_ENV_MANAGED: "1", WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false", GTM_CONNECTIONS_ORIGIN: config.managerOrigin ?? "", GTM_CONNECTIONS_WORKSPACE: state.id }, database.url, database.unpooled);
  process.chdir(cwd);
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd, env: clean, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
    requireThat(result.status === 0, "runtime_preparation_failed", 503);
  };
  run(["scripts/build-viewer.mjs"]);
  // Opening the viewer never migrates. The migrate script finds this workspace's database through the same folder check.
  if (mode === "dev" && !external) run(["scripts/migrate.mjs"]);
  const runtime = mode === "dev" ? databaseEnvironment(await runtimeEnvironment({ journal, store, environment }), database.url, database.unpooled) : clean;
  if (mode === "dev") {
    runtime.GTM_RUN_SECRET = store.loadForRuntime("GTM_RUN_SECRET");
    runtime.GTM_CONNECTIONS_READ_SECRET = store.loadForRuntime("GTM_CONNECTIONS_READ_SECRET");
    runtime.GTM_CONNECTIONS_WORKSPACE = state.id;
    runtime.GTM_CONNECTIONS_PROCESS_GENERATION = randomUUID();
    runtime.GTM_CONNECTIONS_ORIGIN = config.managerOrigin ?? "";
    runtime.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS = "900000"; runtime.WORKFLOW_LOCAL_BODY_TIMEOUT_MS = "900000";
  } else runtime.GTM_VIEWER_MODE = "local";
  runtime.GTM_ENV_MANAGED = "1";
  const generation = runtime.GTM_CONNECTIONS_GENERATION;
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, runtime);
  const port = Number(mode === "viewer" ? environment.GTM_VIEWER_PORT ?? 3939 : environment.GTM_RUNTIME_PORT ?? 3939);
  requireThat(Number.isInteger(port) && port > 0 && port <= 65535, "invalid_local_port");
  const server = await (options.serve ?? nitroServer)({ cwd, port });
  if (mode === "dev") await writePrivateJson(join(state.directory, "runtime.json"), { pid: process.pid, origin: `http://127.0.0.1:${port}`, workspace: state.id, generation, processGeneration: runtime.GTM_CONNECTIONS_PROCESS_GENERATION });
  journal.close();
  console.log(JSON.stringify({ status: mode === "dev" ? "runner_started" : "viewer_started", origin: `http://127.0.0.1:${port}`, ...(generation ? { generation } : {}) }));
  const close = async () => { await server.close(); await database.stop(); };
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => { await close(); process.exit(0); });
  return { origin: `http://127.0.0.1:${port}`, close };
  }
}
async function nitroServer({ cwd, port }) {
  const require = createRequire(join(cwd, "package.json"));
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  // Pinned Nitro's own CLI uses this dev server. The credential loader disables dotenv.
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
