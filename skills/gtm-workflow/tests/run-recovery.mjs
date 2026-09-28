// A run whose start was lost in a dev-server reload recovers on its own: node tests/run-recovery.mjs <runtime>.
// Nitro dev replaces its worker on every reload, and the local queue lives in that worker, so a run created just
// before a reload can be left pending with no message to start it. That run used to block its workflow with
// already_running until someone cancelled it by hand. This test creates exactly that run (run_created written, its
// queue message dropped), reloads the dev server, and expects the run to finish and a new run to start.
import { cp, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startTestPostgres } from "./postgres.mjs";

const source = resolve(process.argv[2] ?? "skills/gtm-workflow/templates");
const target = await mkdtemp(join(tmpdir(), "gtm-run-recovery-"));
const postgres = await startTestPostgres(source);
const pg = (await import(pathToFileURL(createRequire(join(source, "package.json")).resolve("pg")))).default;
const admin = new pg.Client({ host: "127.0.0.1", port: postgres.port, user: "postgres", password: "postgres", database: "postgres" });
await admin.connect();
await admin.query("CREATE DATABASE recovery OWNER gtm");
await admin.end();
const databaseUrl = `postgres://gtm:gtm@127.0.0.1:${postgres.port}/recovery?sslmode=disable`;
let child;
let logs = "";
try {
  for (const name of await readdir(source))
    if (![".env", ".env.local", ".nitro", ".output", ".swc", ".vercel", ".workflow-data", "data", "node_modules", "public"].includes(name))
      await cp(join(source, name), join(target, name), { recursive: true });
  await mkdir(join(target, "node_modules"));
  for (const name of await readdir(join(source, "node_modules")))
    if (![".nitro", ".gtm-viewer"].includes(name)) await symlink(join(source, "node_modules", name), join(target, "node_modules", name));
  const env = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl, WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "true" };
  delete env.VERCEL;
  for (const script of ["scripts/build-viewer.mjs", "scripts/migrate.mjs"]) {
    const r = spawnSync(process.execPath, [script], { cwd: target, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  }
  // The start the reload interrupted: the run is written, its queue message never arrives.
  await writeFile(join(target, "server/api/lost-start.post.ts"), `import { defineHandler } from "nitro";
import { start } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { workflows } from "../../workflows";
export default defineHandler(async () => {
  const world = await getWorld(), wf = workflows["example-scores"];
  const run = await start(wf.run as never, [{ ...wf.defaultInput, rows: [] }] as never, { world: { ...world, queue: async () => ({ messageId: "msg_lost" }) } as never });
  return { id: run.runId };
});
`);
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  child = spawn(process.execPath, ["node_modules/nitro/dist/cli/index.mjs", "dev", "--port", String(port)], { cwd: target, env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  const base = `http://127.0.0.1:${port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const waitFor = async (what, check, seconds = 90) => {
    for (let i = 0; i < seconds; i++) {
      if (child.exitCode !== null) throw new Error(`the dev server exited while waiting for ${what}`);
      const value = await check().catch(() => null);
      if (value) return value;
      await delay(1000);
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  await waitFor("the dev server", async () => (await call("/api/link")).status === 200);

  const lost = await call("/api/lost-start", {});
  assert.equal(lost.status, 200, JSON.stringify(lost.body));
  const id = lost.body.id;
  await delay(3000);
  assert.equal((await call(`/api/runs/${id}`)).body.status, "pending", "the lost start leaves the run pending");
  const blocked = await call("/api/run/example-scores", { rows: [] });
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.body, { error: "already_running", runningRunId: id });

  // A saved file reloads the dev server: a new worker takes over, as it did in the trial.
  await writeFile(join(target, "server/api/reloaded.get.ts"), `import { defineHandler } from "nitro";\nexport default defineHandler(() => ({ reloaded: true }));\n`);
  await waitFor("the reload", async () => (await call("/api/reloaded")).body?.reloaded === true);

  const run = await waitFor("the lost run to finish", async () => {
    const r = (await call(`/api/runs/${id}`)).body;
    return ["completed", "failed", "cancelled"].includes(r?.status) ? r : null;
  }, 60);
  assert.equal(run.status, "completed", JSON.stringify(run));
  const next = await call("/api/run/example-scores", { rows: [] });
  assert.equal(next.status, 200, JSON.stringify(next.body));
  console.log("A run whose start was lost in a reload finished after the reload, and the next run started.");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((r) => child.once("exit", r)), delay(3000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await rm(target, { recursive: true, force: true });
  await postgres.stop();
}
