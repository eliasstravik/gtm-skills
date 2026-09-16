import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupLock } from "../setup/lock.mjs";
test("only one setup holds an instance lock, and release permits a resume", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gtm-setup-lock-"));
  try {
    const release = await setupLock({ directory });
    await assert.rejects(setupLock({ directory }), /setup_already_running/);
    await release(); await release();
    const next = await setupLock({ directory }); await next();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
