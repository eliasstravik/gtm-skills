import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { runGeneratorProcess } from "../../../skills/gtm-workflow/templates/scripts/generate-migration.mjs";

const templates = resolve(import.meta.dirname, "../../../skills/gtm-workflow/templates");
const env = { ...process.env };
for (const name of Object.keys(env)) if (/TURSO|GTM_|VERCEL/.test(name)) delete env[name];

test("real generator reports schema decisions without prompts or partial artifacts", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "gtm-migration-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(templates, root, { recursive: true, filter: (path) => !path.includes("node_modules") });
  await symlink(join(templates, "node_modules"), join(root, "node_modules"));
  const tableFile = join(root, "db/tables/example.ts");
  const table = (name, column = "label") => `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'; export const example = sqliteTable('${name}', { key: text('key').primaryKey(), ${column}: text('${column}') });`;
  function generate(...args) {
    const result = spawnSync("npm", ["run", "db:generate", "--", ...args], { cwd: root, env, encoding: "utf8", timeout: 15_000 });
    assert.equal(result.error, undefined, result.stderr);
    const output = result.stdout.trim().split("\n").at(-1);
    assert.ok(output?.startsWith("{"), `Expected structured result, got ${result.stdout} ${result.stderr}`);
    return { status: result.status, ...JSON.parse(output) };
  }
  async function artifacts() {
    const hash = createHash("sha256");
    for (const name of (await readdir(join(root, "drizzle"), { recursive: true })).sort()) {
      if (/\.(sql|json)$/.test(name)) hash.update(name).update(await readFile(join(root, "drizzle", name)));
    }
    return hash.digest("hex");
  }
  await writeFile(tableFile, table("accounts"));
  const added = generate("--name", "add_accounts");
  assert.equal(added.ok, true, JSON.stringify(added));
  const before = await artifacts();
  await writeFile(tableFile, table("customers"));
  const rename = generate();
  assert.equal(rename.error.code, "migration_input_required");
  assert.deepEqual(rename.error.decisions, [{ kind: "tables", added: ["customers"], removed: ["accounts"] }]);
  assert.equal(await artifacts(), before);
  await writeFile(tableFile, table("accounts", "name"));
  const column = generate();
  assert.equal(column.error.code, "migration_input_required");
  assert.deepEqual(column.error.decisions, [{ kind: "columns", table: "accounts", added: ["name"], removed: ["label"] }]);
  assert.equal(await artifacts(), before);
  await rm(tableFile);
  assert.equal(generate("--name", "drop_accounts").ok, true);
  const journal = JSON.parse(await readFile(join(root, "drizzle/meta/_journal.json")));
  const entry = journal.entries.at(-1);
  assert.match(await readFile(join(root, `drizzle/${entry.tag}.sql`), "utf8"), /DROP TABLE.*accounts/);
  const snapshot = JSON.parse(await readFile(join(root, `drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`)));
  assert.equal(snapshot.tables.accounts, undefined);
  assert.equal(generate().changed, false);
  assert.equal(generate("--custom", "--name", "data_only").ok, true);
  assert.equal(generate("--out", "/tmp/escape").error.code, "invalid_arguments");
  assert.ok(!(await readdir(root)).some((name) => name.startsWith(".gtm-migration-")));
});

test("hung generator and its child are terminated within the deadline", async () => {
  const result = await runGeneratorProcess(process.execPath, ["-e", "require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {stdio:'inherit'}); setInterval(()=>{},1000)"], { timeoutMs: 100 });
  assert.equal(result.code, 124);
  assert.equal(result.timedOut, true);
});
