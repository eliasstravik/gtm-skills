import {
  cp,
  mkdir,
  readdir,
  symlink,
  writeFile,
  readFile,
  rm,
  mkdtemp,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
const source = resolve(process.argv[2] ?? "skills/gtm-workflow/templates");
const target = await mkdtemp(join(tmpdir(), "gtm-reliability-"));
let child;
try {
  for (const name of await readdir(source))
    if (
      ![
        "node_modules",
        ".output",
        ".nitro",
        ".vercel",
        ".swc",
        "data",
        "public",
      ].includes(name)
    )
      await cp(join(source, name), join(target, name), { recursive: true });
  await mkdir(join(target, "node_modules"), { recursive: true });
  for (const name of await readdir(join(source, "node_modules")))
    if (![".nitro", ".gtm-viewer"].includes(name))
      await symlink(
        join(source, "node_modules", name),
        join(target, "node_modules", name),
      );
  function prepare(args) {
    const r = spawnSync(process.execPath, args, {
      cwd: target,
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  }
  // Exercise an older workspace's custom command through the shipped upgrade entrypoint.
  const packagePath = join(target, "package.json");
  const old = JSON.parse(await readFile(packagePath, "utf8"));
  old.version = "0.1.0";
  old.scripts.dev = "nitro dev --port 4400";
  old.scripts.custom = "echo keep";
  await writeFile(packagePath, JSON.stringify(old));
  prepare([
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../scripts/upgrade-package.mjs",
    ),
    target,
    "--write",
  ]);
  const upgraded = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(upgraded.scripts.dev, "nitro dev --port 4400");
  assert.equal(upgraded.scripts.custom, "echo keep");
  prepare(["scripts/build-viewer.mjs"]);
  prepare(["node_modules/drizzle-kit/bin.cjs", "migrate"]);
  prepare(["scripts/viewer-migrate.mjs"]);
  await writeFile(
    join(target, "workflows/reliability-fixture.ts"),
    `
import {runRows} from '../lib/rows';
import {callMcpTool} from '../lib/mcp';
async function settings(){
  "use step";
return {headers:process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS,body:process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS};}
export async function fixture(input:{url:string}){
  "use workflow";
const startup=await settings();const result=await runRows({rows:[{key:'fixture'}],table:'exampleScores',maxRows:1,maxSpendUsd:0,estimateUsd:0,freshForMs:0,step:async()=>{await callMcpTool({url:input.url,timeoutMs:1000},'fixture',{});return{costUsd:0};}});return {startup,...result};}
`,
  );
  const index = join(target, "workflows/index.ts");
  let text = await readFile(index, "utf8");
  text =
    "import {fixture} from './reliability-fixture';\n" +
    text.replace(
      "export const workflows = {",
      "export const workflows = { 'reliability-fixture':{run:fixture,defaultInput:{url:'http://127.0.0.1:1'}},",
    );
  await writeFile(index, text);
  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const env = {
    ...process.env,
    GTM_RUN_SECRET: "local-fixture-secret",
    PATH: join(source, "node_modules/.bin") + ":" + process.env.PATH,
  };
  delete env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS;
  delete env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS;
  delete env.VERCEL;
  child = spawn(
    process.execPath,
    ["node_modules/nitro/dist/cli/index.mjs", "dev", "--port", String(port)],
    { cwd: target, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  const closed = createServer();
  await new Promise((r) => closed.listen(0, "127.0.0.1", r));
  const deadUrl = "http://127.0.0.1:" + closed.address().port;
  await new Promise((r) => closed.close(r));
  const base = "http://localhost:" + port;
  const headers = {
    authorization: "Bearer local-fixture-secret",
    "content-type": "application/json",
  };
  try {
    let ready = false;
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(base + "/api/link", { headers });
        if (r.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(1000);
      if (child.exitCode !== null) throw new Error(logs);
    }
    assert.ok(ready, logs);
    const r = await fetch(base + "/api/run/reliability-fixture", {
      method: "POST",
      headers,
      body: JSON.stringify({ url: deadUrl }),
    });
    assert.ok(r.ok, await r.clone().text());
    const { id } = await r.json();
    let run;
    for (let i = 0; i < 60; i++) {
      run = await (await fetch(base + "/api/runs/" + id, { headers })).json();
      if (["completed", "failed"].includes(run.status)) break;
      await delay(1000);
    }
    console.log(JSON.stringify({ id, run }, null, 2));
    assert.equal(run.status, "completed");
    assert.equal(run.output.failed, 1);
    assert.equal(run.output.startup.headers, "900000");
    assert.equal(run.output.startup.body, "900000");
    const { createClient } = createRequire(join(source, "package.json"))(
      "@libsql/client",
    );
    const client = createClient({ url: "file:" + join(target, "data/gtm.db") });
    const rows = await client.execute(
      "SELECT error FROM example_scores WHERE key='fixture'",
    );
    client.close();
    console.log(rows.rows);
    const diagnostic = JSON.parse(String(rows.rows[0].error));
    assert.equal(diagnostic.layer, "mcp_transport");
    assert.equal(diagnostic.runId, id);
    assert.ok(diagnostic.causes.some((c) => c.code === "ECONNREFUSED"));
    console.log(
      "E2E passed: direct Nitro startup defaults and persisted MCP failure through real Workflow execution.",
    );
  } catch (error) {
    console.error(logs);
    throw error;
  }
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => child.once("exit", r)),
      delay(3000),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await rm(target, { recursive: true, force: true });
}
