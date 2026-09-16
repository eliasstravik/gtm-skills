import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { workspaceState, privateJson, writePrivateJson } from "./state.mjs";
import { openJournal } from "../src/journal.mjs";
import { nativeStore, settings, inspectionEnvironment, runtimeEnvironment } from "./storage.mjs";
import { requireThat } from "../src/errors.mjs";
export async function launch(workspace, mode = "dev") {
  requireThat(!process.env.VERCEL, "local_only");
  const state = await workspaceState(workspace), config = await privateJson(state.configPath), cwd = join(state.workspace, "workflows");
  const journal = await openJournal({ url: `file:${state.database}` });
  const store = nativeStore(state.id), environment = await settings(state.workspace);
  const clean = { ...inspectionEnvironment(environment), GTM_ENV_MANAGED: "1", WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false", GTM_CONNECTIONS_ORIGIN: config.managerOrigin ?? "", GTM_CONNECTIONS_WORKSPACE: state.id };
  process.chdir(cwd);
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd, env: clean, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
    requireThat(result.status === 0, "runtime_preparation_failed", 503);
  };
  run(["scripts/build-viewer.mjs"]);
  if (mode === "dev") for (const args of [["node_modules/drizzle-kit/bin.cjs", "migrate"], ["scripts/profile-migrate.mjs"], ["scripts/viewer-migrate.mjs"]]) run(args);
  const runtime = mode === "dev" ? await runtimeEnvironment({ journal, store, environment }) : clean;
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
  const require = createRequire(join(cwd, "package.json"));
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  // Pinned Nitro's own CLI uses this dev server. The credential loader disables dotenv.
  const { NitroDevServer } = await import(pathToFileURL(join(dirname(require.resolve("nitro/package.json")), "dist/_dev.mjs")));
  let nitro;
  const port = Number(mode === "viewer" ? environment.GTM_VIEWER_PORT ?? 3939 : environment.GTM_RUNTIME_PORT ?? 3939);
  requireThat(Number.isInteger(port) && port > 0 && port <= 65535, "invalid_local_port");
  async function reload() {
    if (nitro) { await nitro.options._c12.unwatch?.(); await nitro.close(); }
    nitro = await createNitro({ rootDir: cwd, dev: true, _cli: { command: "dev" } }, { dotenv: false, watch: true, c12: { onUpdate: reload } });
    nitro.hooks.hookOnce("restart", reload);
    await new NitroDevServer(nitro).listen({ port, hostname: "127.0.0.1" });
    await prepare(nitro); await build(nitro);
  }
  await reload();
  if (mode === "dev") await writePrivateJson(join(state.directory, "runtime.json"), { pid: process.pid, origin: `http://127.0.0.1:${port}`, workspace: state.id, generation, processGeneration: runtime.GTM_CONNECTIONS_PROCESS_GENERATION });
  journal.close();
  console.log(JSON.stringify({ status: mode === "dev" ? "runner_started" : "viewer_started", origin: `http://127.0.0.1:${port}`, ...(generation ? { generation } : {}) }));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => { await nitro.close(); process.exit(0); });
}
