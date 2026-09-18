// The build's query check: a workspace whose workflow scans, pages by OFFSET, reads heavy columns in bulk or holds
// its own database client must fail `npm run build` before it deploys. node tests/query-check.mjs /path/to/workflows
import { mkdtemp, cp, symlink, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const runtime = resolve(process.argv[2]);
const dir = await mkdtemp(join(tmpdir(), "gtm-query-check-"));
function check() {
  const result = spawnSync(process.execPath, ["scripts/check-queries.mjs"], { cwd: dir, encoding: "utf8" });
  return { ok: result.status === 0, output: result.stdout + result.stderr };
}
async function workflow(body) {
  await writeFile(
    join(dir, "workflows/probe.ts"),
    `import { defineQuery } from "../lib/query";\nimport { nextBatch } from "../lib/profiles/population";\nimport { rawClient } from "../lib/db";\n${body}\nexport async function probe() {\n  "use workflow";\n  return "done";\n}\n`,
  );
}
try {
  for (const name of ["lib", "scripts", "db", "drizzle", "workflows", "server", "package.json", "tsconfig.json", "drizzle.config.ts"])
    await cp(join(runtime, name), join(dir, name), { recursive: true });
  await mkdir(join(dir, "node_modules"));
  for (const name of await readdir(join(runtime, "node_modules")))
    if (!name.startsWith(".") || name === ".bin") await symlink(join(runtime, "node_modules", name), join(dir, "node_modules", name));
  await writeFile(
    join(dir, "workflows/index.ts"),
    "import { probe } from './probe'; export const workflows = { probe: { run: probe } };",
  );

  await workflow(`export const members = defineQuery({ name: "probe/members", sql: "SELECT entity_key FROM profile_memberships WHERE workflow_id = ? AND entity = 'people' AND entity_key IN (??)", example: ["w", ["a", "b"]] });
export async function page() { "use step"; const client = rawClient(); try { return await nextBatch(client, "w", "people", { limit: 10, columns: ["full_name"] }); } finally { client.close(); } }`);
  let result = check();
  assert.ok(result.ok, result.output);
  assert.match(result.output, /1 workflow quer/);

  await workflow(`export const scan = defineQuery({ name: "probe/scan", sql: "SELECT pp.key FROM people pp WHERE EXISTS (SELECT 1 FROM json_each(COALESCE(pp.sources_json, '[]')) m WHERE json_extract(m.value, '$.workflow_id') = ?)", example: ["w"] });`);
  result = check();
  assert.ok(!result.ok, "a scanning workflow query must fail the build");
  assert.match(result.output, /probe\/scan[\s\S]*scans people/);

  await workflow(`export const paged = defineQuery({ name: "probe/paged", sql: "SELECT key FROM people WHERE key > ? ORDER BY key LIMIT 10 OFFSET 20", example: [""] });`);
  result = check();
  assert.ok(!result.ok && /probe\/paged[\s\S]*OFFSET/.test(result.output), result.output);

  await workflow(`export const heavy = defineQuery({ name: "probe/heavy", sql: "SELECT * FROM people WHERE key IN (??)", example: [["a"]] });`);
  result = check();
  assert.ok(!result.ok && /probe\/heavy[\s\S]*raw_responses_json/.test(result.output), result.output);

  await workflow(`export const broken = defineQuery({ name: "probe/broken", sql: "SELECT label FROM nowhere WHERE key = ?", example: ["a"] });`);
  result = check();
  assert.ok(!result.ok && /probe\/broken[\s\S]*no such table/.test(result.output), result.output);

  await workflow(`export async function inline() { "use step"; const client = rawClient(); return client.execute("SELECT 1"); }`);
  result = check();
  assert.ok(!result.ok && /workflows\/probe\.ts[\s\S]*defineQuery/.test(result.output), result.output);

  await workflow("");
  await writeFile(join(dir, "lib/side-door.ts"), 'import { createClient } from "@libsql/client";\nexport const door = () => createClient({ url: "file:./data/gtm.db" });\n');
  result = check();
  assert.ok(!result.ok && /lib\/side-door\.ts[\s\S]*lib\/db\.ts/.test(result.output), result.output);
  console.log("query check ok");
} finally {
  await rm(dir, { recursive: true, force: true });
}
