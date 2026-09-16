// An empty authored registry is valid, both before Create and after deleting the last workflow.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const source = resolve(process.argv[2] ?? "skills/gtm-workflow/templates");
const target = await mkdtemp(join(tmpdir(), "gtm-empty-workspace-"));
const env = { ...process.env, GTM_RUN_SECRET: "empty-workspace-test" };
for (const key of ["VERCEL", "GTM_VIEWER_MODE", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "NITRO_PRESET"])
  delete env[key];
let child;
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: target, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 120000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
try {
  for (const name of ["lib", "scripts", "viewer", "connections-ui", "server", "viewer-server", "share-server", "db", "drizzle", "skills", "package.json", "tsconfig.json", "nitro.config.ts", "drizzle.config.ts", "vercel.json"])
    await cp(join(source, name), join(target, name), { recursive: true });
  await mkdir(join(target, "node_modules"));
  for (const name of await readdir(join(source, "node_modules")))
    if (![".nitro", ".gtm-viewer", ".cache"].includes(name))
      await symlink(join(source, "node_modules", name), join(target, "node_modules", name));
  await mkdir(join(target, "workflows"));
  await writeFile(join(target, "workflows/index.ts"), "export const workflows = {} as const;\n");
  run(process.execPath, ["scripts/build-viewer.mjs"]);
  assert.deepEqual(JSON.parse(await readFile(join(target, "node_modules/.gtm-viewer/registry.json"), "utf8")), []);
  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);
  run("npm", ["run", "build"]);

  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  child = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: target, env: { ...env, PORT: String(port), HOST: "127.0.0.1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", chunk => { logs += chunk; });
  child.stderr.on("data", chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { response = await fetch(`${base}/api/viewer?op=list&v=3`); break; }
    catch { await delay(100); }
  }
  assert.equal(response?.status, 200, logs);
  assert.deepEqual((await response.json()).workflows, []);
  assert.equal((await fetch(`${base}/api/run/missing`, {
    method: "POST", headers: { authorization: "Bearer empty-workspace-test" },
  })).status, 404);
  assert.equal((await fetch(`${base}/api/intake/missing`, { method: "POST" })).status, 404);
  child.kill("SIGTERM");
  await new Promise(resolve => child.once("exit", resolve));
  child = undefined;

  run(process.execPath, ["node_modules/nitro/dist/cli/index.mjs", "build", "--preset", "vercel"]);
  run("npm", ["run", "build:share"], { NITRO_PRESET: "vercel" });
  console.log("Empty workspace: TypeScript, private build, Vercel private/share builds, empty viewer, and missing-workflow routes pass.");
} finally {
  child?.kill("SIGTERM");
  await rm(target, { recursive: true, force: true });
}
