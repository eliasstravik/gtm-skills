// An open viewer follows the workspace without a reload: node tests/live-refresh.mjs <runtime>. Needs agent-browser.
// Starts the Nitro dev server the way connections/local/launch.mjs does, over a copy of the template on its own
// Postgres, then changes workflows, rows, tables and the deployment under an open page.
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { startTestPostgres } from "./postgres.mjs";

const runtime = resolve(process.argv[2] ?? "templates");
const dir = await mkdtemp(join(tmpdir(), "gtm-live-refresh-"));
const run = promisify(execFile);
const PORT = 3943, origin = `http://127.0.0.1:${PORT}`;
for (const name of await readdir(runtime))
  if (!["node_modules", ".output", ".nitro", "public"].includes(name)) await cp(join(runtime, name), join(dir, name), { recursive: true });
await mkdir(join(dir, "node_modules"));
for (const name of await readdir(join(runtime, "node_modules")))
  if (!name.startsWith(".") || name === ".bin") await symlink(join(runtime, "node_modules", name), join(dir, "node_modules", name));
const postgres = await startTestPostgres(runtime);
const url = `postgres://gtm:gtm@127.0.0.1:${postgres.port}/gtm`;
Object.assign(process.env, { DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, VERCEL_DEPLOYMENT_ID: "dpl_first" });
const require = createRequire(join(dir, "package.json"));
const pg = require("pg");
let nitro;
// Never spawnSync here: this process is also the server the browser is loading.
const browser = async (...args) => {
  try {
    const { stdout } = await run("agent-browser", ["--session", "gtm-live-refresh", ...args], { encoding: "utf8", timeout: 60000 });
    return stdout.trim();
  } catch (error) {
    throw Error(`agent-browser ${args.join(" ")}: ${error.stderr || error.stdout || error.message}`);
  }
};
const evaluate = async (code) => JSON.parse(await browser("eval", code));
const waitFor = (code, timeout = 30000) => browser("wait", "--fn", code, "--timeout", String(timeout));
const sql = async (text) => {
  const client = new pg.Client(url);
  await client.connect();
  try { await client.query(text); } finally { await client.end(); }
};
// Records which viewer operations the page asks for, and marks the page so a reload shows.
const watchRequests = () => evaluate(`(() => { window.liveMarker = true; window.ops = []; const f = window.fetch;
  window.fetch = (u, o) => { window.ops.push(new URL(u, location.href).searchParams.get("op")); return f(u, o); }; return true; })()`);
const index = join(dir, "workflows/index.ts"), original = await readFile(index, "utf8");
const withProof = (title) => original
  .replace("/** Registry by slug", 'import { proof, defaultInput as proofInput } from "./proof";\n/** Registry by slug')
  .replace("export const workflows = {", `export const workflows = {\n  proof: { run: proof, defaultInput: proofInput, viewer: { id: "11111111-2222-3333-4444-555555555555", title: ${JSON.stringify(title)}, description: "Proof.", businessGraph: { nodes: [{ id: "ready", label: "Ready", kind: "output", explanation: "Return." }], edges: [] } } },`);

try {
  for (const script of ["scripts/build-viewer.mjs", "scripts/migrate.mjs"]) {
    const result = spawnSync(process.execPath, [script], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  process.chdir(dir);
  const { createNitro, prepare, build } = await import(pathToFileURL(require.resolve("nitro/builder")));
  const { NitroDevServer } = await import(pathToFileURL(join(dirname(require.resolve("nitro/package.json")), "dist/_dev.mjs")));
  nitro = await createNitro({ rootDir: dir, dev: true, _cli: { command: "dev" } }, { dotenv: false, watch: true });
  await new NitroDevServer(nitro).listen({ port: PORT, hostname: "127.0.0.1" });
  await prepare(nitro);
  await build(nitro);

  await browser("open", `${origin}/viewer`);
  await browser("wait", "--text", "Score example companies");
  await watchRequests();
  // A new workflow file: the dev server rebuilds the registry, and the list shows it without a reload.
  await writeFile(join(dir, "workflows/proof.ts"), 'export async function proof(input: { approved: boolean }) {\n  "use workflow";\n  return "Ready";\n}\nexport const defaultInput = { approved: true };\n');
  await writeFile(index, withProof("Proof workflow"));
  await browser("wait", "--text", "Proof workflow", "--timeout", "30000");
  assert.equal(await evaluate("window.liveMarker === true"), true, "a new workflow must not reload the page");

  // Renamed and removed under its own open page.
  await browser("open", `${origin}/viewer?workflow=11111111-2222-3333-4444-555555555555`);
  await browser("wait", "--text", "Proof workflow");
  await watchRequests();
  await writeFile(index, withProof("Proof renamed"));
  await browser("wait", "--text", "Proof renamed", "--timeout", "30000");
  await writeFile(index, original);
  await rm(join(dir, "workflows/proof.ts"));
  await browser("wait", "--text", "Workflow not found", "--timeout", "30000");
  assert.equal(await evaluate("window.liveMarker === true"), true, "a removed workflow must not reload the page");

  // Rows and tables: an idle page only pulses; a committed write re-reads the data.
  await sql("CREATE TABLE live_probe (id INTEGER PRIMARY KEY, name TEXT)");
  await sql("INSERT INTO live_probe VALUES (1, 'Ada First')");
  await browser("open", `${origin}/viewer?view=data&table=live_probe`);
  await browser("wait", "--text", "Ada First");
  await watchRequests();
  await new Promise((done) => setTimeout(done, 12000));
  const idle = await evaluate("window.ops");
  assert.ok(idle.length >= 2 && idle.every((op) => op === "pulse"), `an idle page asked for ${idle}`);
  await sql("INSERT INTO live_probe VALUES (2, 'Grace Second')");
  await browser("wait", "--text", "Grace Second", "--timeout", "30000");
  await sql("CREATE TABLE live_new_table (id INTEGER)");
  await waitFor('[...document.querySelectorAll("[name=data-table] option")].some((o) => o.textContent === "live_new_table")');
  assert.equal(await evaluate("window.liveMarker === true"), true, "new data must not reload the page");

  // A new deployment reloads the page for its assets. The dev worker takes the environment when it restarts.
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_second";
  await writeFile(join(dir, "lib/live-refresh-touch.ts"), "export const touched = 1;\n");
  await waitFor("window.liveMarker !== true");
  await browser("wait", "--text", "live_probe");
  console.log("Live refresh: new, renamed and removed workflows, new rows and tables without a reload; an idle page only pulses; a new deployment reloads.");
} finally {
  await browser("close").catch(() => {});
  await nitro?.close();
  await postgres.stop();
  await rm(dir, { recursive: true, force: true });
}
process.exit(0);
