import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (process.env.VERCEL) throw Error("Local viewer mode runs on your computer.");
if (!existsSync("data/gtm.db"))
  throw Error(
    "No local database. Initialize the workflow database before opening the viewer.",
  );
const env = {
  ...process.env,
  GTM_VIEWER_MODE: "local",
  WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false",
  HOST: "127.0.0.1",
  PORT: process.env.GTM_VIEWER_PORT ?? "3939",
  WORKFLOW_TARGET_WORLD: "local",
};
for (const command of [
  [process.execPath, "scripts/build-viewer.mjs"],
  ["node_modules/.bin/nitro", "build"],
]) {
  const r = spawnSync(command[0], command.slice(1), { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const child = spawn(process.execPath, [".output/viewer/server/index.mjs"], {
  stdio: "inherit",
  env,
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
