import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
test("Windows secures a synthetic file and rejects a broad read grant", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "gtm-acl-test-")), file = join(directory, "synthetic.txt");
  try {
    await writeFile(file, "synthetic ACL fixture, no credentials");
    const run = (mode) => spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("../local/windows-state.ps1", import.meta.url)), mode, file], { encoding: "utf8" });
    const protectedFile = run("protect");
    assert.equal(protectedFile.status, 0, protectedFile.stderr);
    assert.equal(run("check").status, 0);
    assert.equal(spawnSync("icacls.exe", [file, "/grant", "*S-1-1-0:R"]).status, 0);
    assert.notEqual(run("check").status, 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
