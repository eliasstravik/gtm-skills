import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sourceProvenance, componentDigest, sourceDigest, installationProvenance } from "../local/install.mjs";
test("release provenance distinguishes committed source, local edits and detached copies", async () => {
  const root = await mkdtemp(join(tmpdir(), "gtm-provenance-")), source = join(root, "connections");
  const git = (...args) => { const result = spawnSync("git", args, { cwd: root, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  try {
    await mkdir(source); await mkdir(join(root, "templates"));
    await writeFile(join(source, "module.mjs"), "export const version = 1;\n");
    await writeFile(join(source, "package.json"), '{"version":"0.0.1"}');
    assert.deepEqual(sourceProvenance(source), { sourceCommit: null, development: true });
    git("init", "--quiet"); git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "-m", "Synthetic provenance fixture");
    const commit = git("rev-parse", "HEAD");
    assert.deepEqual(sourceProvenance(source), { sourceCommit: commit, development: false });
    await writeFile(join(root, "unrelated.txt"), "unrelated change\n");
    assert.equal(sourceProvenance(source).development, false);
    await writeFile(join(root, "templates", "shared.css"), "body {}\n");
    assert.equal(sourceProvenance(source).development, true);
    const before = await componentDigest(source);
    await writeFile(join(source, "provenance.json"), JSON.stringify({ sourceCommit: commit, development: true }));
    assert.notEqual(await componentDigest(source), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("a copied release retains its commit provenance, and altered copies cannot deploy", async () => {
  const source = await mkdtemp(join(tmpdir(), "gtm-release-copy-"));
  try {
    await writeFile(join(source, "package.json"), '{"version":"0.0.1"}');
    await writeFile(join(source, "module.mjs"), "export const version = 1;\n");
    const sourceCommit = "a".repeat(40);
    await writeFile(join(source, "release.json"), JSON.stringify({ version: "0.0.1", sourceCommit, sourceDigest: await sourceDigest(source) }));
    assert.deepEqual(await installationProvenance(source), { sourceCommit, development: false });
    await writeFile(join(source, "module.mjs"), "export const version = 2;\n");
    assert.equal((await installationProvenance(source)).development, true);
  } finally { await rm(source, { recursive: true, force: true }); }
});
