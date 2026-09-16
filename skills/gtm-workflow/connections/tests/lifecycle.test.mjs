import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openJournal } from "../src/journal.mjs";
import { localStorage, runtimeEnvironment } from "../local/storage.mjs";
import { createManager } from "../src/manager.mjs";
const sentinel = "synthetic-sentinel-never-return-8943";
async function fixture() {
  const journal = await openJournal({ url: ":memory:" }), values = new Map();
  const store = { set: (name, value) => values.set(name, value), remove: (name) => values.delete(name), loadForRuntime: (name) => values.get(name) };
  const environment = { BLITZ_API_KEY: "external-sentinel", PATH: "/bin" };
  const storage = localStorage({ journal, store, environment });
  let active = null;
  const manager = createManager({ journal, storage, active: async () => active, context: { mode: "local" } });
  return { journal, values, store, environment, manager, storage, setActive: (value) => active = value };
}
test("empty-workflow CRUD, managed precedence, tombstones and generation activation", async () => {
  const f = await fixture();
  try {
    let rows = (await f.manager.inventory()).connections;
    assert.equal(rows[0].status, "Configured externally");
    await f.manager.change({ id: randomUUID(), variable: "BLITZ_API_KEY", action: "replace", value: sentinel, version: "external" }, "owner");
    let env = await runtimeEnvironment(f); assert.equal(env.BLITZ_API_KEY, sentinel); assert.equal(env.GTM_CONNECTIONS_GENERATION, "1");
    rows = (await f.manager.inventory()).connections; assert.equal(rows[0].status, "Saved locally, runner not started");
    f.setActive({ generation: "1", connections: [{ id: "blitz", configured: true, usage: [] }] });
    assert.equal((await f.manager.inventory()).connections[0].status, "Runner restarted after save");
    await f.manager.change({ id: randomUUID(), variable: "BLITZ_API_KEY", action: "disconnect", version: "1" }, "owner");
    env = await runtimeEnvironment(f); assert.equal(env.BLITZ_API_KEY, undefined); assert.equal(f.values.has("BLITZ_API_KEY"), false);
    assert.match((await f.manager.inventory()).connections[0].status, /restart local runner/);
    f.setActive({ generation: "2", connections: [] });
    assert.equal((await f.manager.inventory()).connections[0].status, "Disconnected");
    assert.equal(JSON.stringify(await f.manager.inventory()).includes(sentinel), false);
    assert.equal(JSON.stringify(await f.journal.operations()).includes(sentinel), false);
  } finally { f.journal.close(); }
});
test("an ambiguous native save is never replayed and requires explicit supersession", async () => {
  const f = await fixture(); let writes = 0;
  f.store.set = () => { writes++; throw Error(sentinel); };
  const body = { id: randomUUID(), variable: "CUSTOM_API_KEY", action: "add", value: sentinel, version: "absent" };
  try {
    await assert.rejects(f.manager.change({ ...body }, "owner"), /save_outcome_requires_review/);
    assert.equal((await f.journal.operation(body.id)).phase, "unresolved");
    assert.equal((await f.manager.change({ ...body }, "owner")).phase, "unresolved"); assert.equal(writes, 1);
    await assert.rejects(f.manager.change({ ...body, id: randomUUID() }, "owner"), /explicit_replacement_required/);
    await assert.rejects(runtimeEnvironment(f), /resolve_connection_before_restart/);
    assert.equal(JSON.stringify(await f.manager.inventory()).includes(sentinel), false);
  } finally { f.journal.close(); }
});
test("optimistic versions and workspace lease reject conflicting writes", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.manager.change({ id: randomUUID(), variable: "BLITZ_API_KEY", action: "replace", value: sentinel, version: "wrong" }, "owner"), /connection_changed/);
    const lease = await f.journal.acquire(); await assert.rejects(f.journal.acquire(), /operation_in_progress/); await f.journal.release(lease);
    assert.equal(f.values.size, 0);
  } finally { f.journal.close(); }
});
