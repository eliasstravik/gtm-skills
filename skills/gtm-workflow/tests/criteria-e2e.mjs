// A workflow reads the workspace's persona and ICP files when it runs, not a copy made when it was written: edit the
// file between two runs of one dev server and the second run sees the edit. The build bakes the same files for the
// deployed copy. Run: node tests/criteria-e2e.mjs <templates folder with node_modules>
import { cp, mkdir, readdir, symlink, writeFile, readFile, rm, mkdtemp } from "node:fs/promises";
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
const workspace = await mkdtemp(join(tmpdir(), "gtm-criteria-"));
const target = join(workspace, "workflows");
const postgres = await startTestPostgres(source);
const pg = (await import(pathToFileURL(createRequire(join(source, "package.json")).resolve("pg")))).default;
const admin = new pg.Client({ host: "127.0.0.1", port: postgres.port, user: "postgres", password: "postgres", database: "postgres" });
await admin.connect();
await admin.query("CREATE DATABASE criteria OWNER gtm");
await admin.end();
const databaseUrl = `postgres://gtm:gtm@127.0.0.1:${postgres.port}/criteria?sslmode=disable`;

const persona = (titles) => `# Revenue leader

## Person data

- Job titles: ${titles}
- Seniority: Director, VP
- Years of experience: Unknown
- Function: Sales
- Location: Unknown
- Languages: English
- Education: Unknown
- Headline: Unknown
- About: Unknown
- Estimated followers: Unknown
- Network size: Unknown

## Person signals

<!-- Optional; one line per signal that raises fit; remove this section when empty. -->
- Hiring sellers
`;
const icp = `# Lean B2B SaaS

## Company data

- Business types: B2B
- Company size: 1,001+ employees
- Location:
  - Europe
  - North America

## Disqualifiers

- Direct competitor
`;

let child;
try {
  await mkdir(target);
  for (const name of await readdir(source))
    if (![".gitignore", "node_modules", ".output", ".nitro", ".vercel", ".swc", "data", "public", ".workflow-data"].includes(name))
      await cp(join(source, name), join(target, name), { recursive: true });
  await mkdir(join(target, "node_modules"));
  for (const name of await readdir(join(source, "node_modules")))
    if (![".nitro", ".gtm-viewer"].includes(name)) await symlink(join(source, "node_modules", name), join(target, "node_modules", name));
  await mkdir(join(workspace, "personas/revenue-leader"), { recursive: true });
  await mkdir(join(workspace, "icps/lean-b2b-saas"), { recursive: true });
  await writeFile(join(workspace, "personas/revenue-leader/PERSONA.md"), persona("Head of Sales, VP Sales"));
  await writeFile(join(workspace, "icps/lean-b2b-saas/ICP.md"), icp);
  await writeFile(
    join(target, "workflows/criteria-fixture.ts"),
    `import { items, readIcp, readPersona } from "../lib/criteria";
export async function criteriaFixture(input: { persona?: string }) {
  "use workflow";
  const persona = await readPersona(input.persona ?? "revenue-leader");
  const icp = await readIcp("lean-b2b-saas");
  return { name: persona.name, titles: items(persona.fields["Job titles"]), languages: persona.fields.Languages, unknown: "Headline" in persona.fields,
    signals: persona.signals, size: icp.fields["Company size"], location: items(icp.fields.Location), disqualifiers: icp.disqualifiers, prompt: icp.text };
}
`,
  );
  const graph = { nodes: [{ id: "read", label: "Read the criteria", kind: "output", explanation: "Return the persona and ICP as the run read them." }], edges: [] };
  const index = join(target, "workflows/index.ts");
  await writeFile(index, "import { criteriaFixture } from './criteria-fixture';\n" +
    (await readFile(index, "utf8")).replace("export const workflows = {", `export const workflows = { 'criteria-fixture': { run: criteriaFixture, defaultInput: {}, viewer: { description: 'Read the criteria.', businessGraph: ${JSON.stringify(graph)} } },`));
  const prepare = (args, env = process.env) => {
    const r = spawnSync(process.execPath, args, { cwd: target, encoding: "utf8", env });
    if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  };
  prepare(["scripts/viewer-registry.mjs"]);
  prepare(["scripts/build-viewer.mjs"]);
  // What the deployed copy reads: the build baked both files from outside workflows/.
  const generated = await readFile(join(target, "lib/criteria.generated.ts"), "utf8");
  const baked = JSON.parse(/= (\{[\s\S]*\});\nexport default/.exec(generated)[1]);
  assert.deepEqual(Object.keys(baked).sort(), ["icps/lean-b2b-saas/ICP.md", "personas/revenue-leader/PERSONA.md"]);
  assert.match(baked["personas/revenue-leader/PERSONA.md"], /Head of Sales, VP Sales/);
  prepare(["scripts/migrate.mjs"], { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl });

  const socket = createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const env = { ...process.env, DATABASE_URL: databaseUrl, DATABASE_URL_UNPOOLED: databaseUrl, PATH: join(source, "node_modules/.bin") + ":" + process.env.PATH };
  delete env.VERCEL;
  child = spawn(process.execPath, ["node_modules/nitro/dist/cli/index.mjs", "dev", "--port", String(port)], { cwd: target, env, stdio: ["ignore", "pipe", "pipe"] });
  let logs = "";
  child.stdout.on("data", (d) => (logs += d));
  child.stderr.on("data", (d) => (logs += d));
  const base = "http://localhost:" + port, headers = { "content-type": "application/json" };
  const run = async (body = {}) => {
    const r = await fetch(base + "/api/run/criteria-fixture", { method: "POST", headers, body: JSON.stringify(body) });
    assert.ok(r.ok, await r.clone().text());
    const { id } = await r.json();
    for (let i = 0; i < 120; i++) {
      const result = await (await fetch(base + "/api/runs/" + id, { headers })).json();
      if (["completed", "failed"].includes(result.status)) return result;
      await delay(1000);
    }
    throw new Error("The run did not finish");
  };
  try {
    let ready = false;
    for (let i = 0; i < 180 && !ready; i++) {
      try { ready = (await fetch(base + "/api/link", { headers })).ok; } catch {}
      if (!ready) await delay(1000);
      if (child.exitCode !== null) throw new Error(logs);
    }
    assert.ok(ready, logs);
    const first = await run();
    assert.equal(first.status, "completed", JSON.stringify(first));
    assert.deepEqual(first.output.titles, ["Head of Sales", "VP Sales"]);
    assert.equal(first.output.name, "Revenue leader");
    assert.equal(first.output.languages, "English");
    assert.equal(first.output.unknown, false);
    assert.deepEqual(first.output.signals, ["Hiring sellers"]);
    assert.equal(first.output.size, "1,001+ employees");
    assert.deepEqual(first.output.location, ["Europe", "North America"]);
    assert.deepEqual(first.output.disqualifiers, ["Direct competitor"]);
    assert.match(first.output.prompt, /^# Lean B2B SaaS/);

    // The edit a user makes through gtm-persona, with no change to workflow code and no restart.
    await writeFile(join(workspace, "personas/revenue-leader/PERSONA.md"), persona("Chief Revenue Officer"));
    const second = await run();
    assert.equal(second.status, "completed", JSON.stringify(second));
    assert.deepEqual(second.output.titles, ["Chief Revenue Officer"]);

    // A persona that does not exist fails the run by name instead of scoring against nothing.
    const missing = await run({ persona: "no-such-persona" });
    assert.equal(missing.status, "failed");
    assert.match(logs, /personas\/no-such-persona\/PERSONA\.md is not in this workspace/);
    console.log("E2E passed: workflows read persona and ICP files at run time, and the build bakes them for the deployed copy.");
  } catch (error) {
    console.error(logs);
    throw error;
  }
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([new Promise((r) => child.once("exit", r)), delay(3000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await rm(workspace, { recursive: true, force: true });
  await postgres.stop();
}
