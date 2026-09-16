import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, chmod } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { workspaceState, writePrivateJson, privateJson } from "../local/state.mjs";

test("concurrent registrations converge and independent clones retain distinct identities", async () => {
  const root = await mkdtemp(join(homedir(), ".gtm-state-test-"));
  const first = join(root, "first"), second = join(root, "second");
  await mkdir(first); await mkdir(second);
  const options = { root, boundary: root, create: true };
  try {
    const registrations = await Promise.all(Array.from({ length: 24 }, () => workspaceState(first, options)));
    assert.equal(new Set(registrations.map((entry) => entry.id)).size, 1);
    const clone = await workspaceState(second, options);
    assert.notEqual(clone.id, registrations[0].id);
    const reads = await Promise.all(Array.from({ length: 24 }, () => workspaceState(first, { ...options, create: false })));
    assert.ok(reads.every((entry) => entry.id === registrations[0].id));
    const alias = join(root, "alias"); await symlink(first, alias);
    assert.equal((await workspaceState(alias, options)).id, registrations[0].id);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("state files reject links and permissions exposing metadata to another OS user", async () => {
  const root = await mkdtemp(join(homedir(), ".gtm-state-test-")), file = join(root, "state.json"), link = join(root, "alias.json");
  try {
    await writePrivateJson(file, { safe: true }); await symlink(file, link);
    await assert.rejects(() => privateJson(link), /unsafe_state_file/);
    await chmod(file, 0o644);
    await assert.rejects(() => privateJson(file), /unsafe_state_file/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
