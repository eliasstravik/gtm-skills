import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { ensureWorkspaceRepository } from "../setup/repository.mjs";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gtm-repository-test-")), workspace = join(root, "workspace"), bare = join(root, "remote.git");
  await mkdir(workspace); await mkdir(join(workspace, "workflows"));
  const git = (args, cwd = workspace) => { const result = spawnSync("git", args, { cwd, encoding: "utf8" }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  git(["init", "--bare", bare]); git(["init", "-b", "main"]); git(["remote", "add", "origin", bare]);
  git(["config", "commit.gpgsign", "false"]);
  const contents = '{"version":"0.0.1"}\n'; await writeFile(join(workspace, "workflows", "package.json"), contents);
  await writeFile(join(workspace, "unrelated.txt"), "preserve this user work");
  const config = { scaffold: [{ path: "workflows/package.json", digest: createHash("sha256").update(contents).digest("hex") }] };
  const data = new Map(), journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  const args = { workspace, githubOwner: "owner", config, journal,
    execute: (command, args, options) => args.join(" ") === "remote get-url origin" ? { status: 0, stdout: "https://github.com/owner/workspace.git\n" } : spawnSync(command, args, options),
    run: (_command, args) => JSON.stringify(args[1] === "user" ? { login: "owner" } : { type: "file", sha: "synthetic" }) };
  return { root, workspace, bare, git, args };
}
test("standalone scaffold publishes only its own files and repeated setup does not add commits", async () => {
  const f = await fixture();
  try {
    await ensureWorkspaceRepository(f.args);
    const commit = f.git(["rev-parse", "HEAD"]);
    assert.equal(f.git(["ls-tree", "-r", "--name-only", "HEAD"]), "workflows/package.json");
    assert.match(f.git(["status", "--porcelain"]), /\?\? unrelated.txt/);
    assert.equal(f.git(["rev-parse", "main"], f.bare), commit);
    await ensureWorkspaceRepository(f.args);
    assert.equal(f.git(["rev-parse", "HEAD"]), commit);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
test("scaffold publishing preserves staged user work and rejects modified generated source", async () => {
  const f = await fixture();
  try {
    f.git(["add", "unrelated.txt"]);
    await assert.rejects(ensureWorkspaceRepository(f.args), /publish_scaffold_before_setup/);
    assert.equal(f.git(["diff", "--cached", "--name-only"]), "unrelated.txt");
    f.git(["rm", "--cached", "unrelated.txt"]);
    await writeFile(join(f.workspace, "workflows", "package.json"), "user-modified source");
    await assert.rejects(ensureWorkspaceRepository(f.args), /scaffold_changed_before_publish/);
    assert.equal(f.git(["diff", "--cached", "--name-only"]), "");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
