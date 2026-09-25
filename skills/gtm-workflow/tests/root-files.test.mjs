// The workspace root's template-owned files: the CI that setup creates and Doctor compares, and the root ignore file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rootFiles, rootFileDrift, writeRootFiles } from "../scripts/root-files.mjs";

const skill = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFile(join(skill, path), "utf8");

test("the root ignore file only keeps Vercel links and env files out, and both skills ship the same one", async () => {
  assert.equal(await read("root/gitignore"), ".vercel\n.env*\n");
  assert.equal(await read("../gtm-workspace/templates/gitignore"), await read("root/gitignore"));
});

test("the workspace CI runs only commands the template provides, with pinned actions", async () => {
  const ci = await read("root/github/workflows/check.yml");
  assert.match(ci, /working-directory: workflows\n/);
  for (const [, action] of ci.matchAll(/uses: (\S+)/g)) assert.match(action, /@[0-9a-f]{40}$/, action);
  const { scripts } = JSON.parse(await read("templates/package.json"));
  for (const [, name] of ci.matchAll(/run: npm run (\S+)/g)) assert.ok(scripts[name], `npm run ${name}`);
  for (const [, file] of ci.matchAll(/run: node (scripts\/\S+)/g)) assert.ok(existsSync(join(skill, "templates", file)), file);
  for (const [, file] of ci.matchAll(/run: node (node_modules\/\S+)/g)) assert.match(file, /^node_modules\/typescript\//);
});

test("setup creates missing root files, keeps existing ones, and Doctor reports drift", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gtm-root-files-"));
  try {
    assert.deepEqual(await rootFileDrift(workspace), rootFiles.map(({ path }) => ({ path, status: "missing" })));
    await writeFile(join(workspace, ".gitignore"), ".vercel\n.env*\nnotes/\n");
    assert.deepEqual(await writeRootFiles(workspace), [".github/workflows/check.yml"]);
    assert.equal(await readFile(join(workspace, ".gitignore"), "utf8"), ".vercel\n.env*\nnotes/\n");
    assert.deepEqual(await rootFileDrift(workspace), [{ path: ".gitignore", status: "differs" }]);
    await rm(join(workspace, ".gitignore"));
    assert.deepEqual(await writeRootFiles(workspace), [".gitignore"]);
    assert.deepEqual(await rootFileDrift(workspace), []);
    assert.deepEqual(await writeRootFiles(workspace), []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
