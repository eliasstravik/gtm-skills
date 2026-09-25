import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openJournal } from "../src/journal.mjs";
import { localStorage, runtimeEnvironment, inspectionEnvironment } from "../local/storage.mjs";
import { createManager } from "../src/manager.mjs";
const sentinel = "synthetic-sentinel-never-return-8943";
async function fixture() {
  const journal = await openJournal({ url: ":memory:" }), values = new Map();
  const store = { set: (name, value) => values.set(name, value), remove: (name) => values.delete(name), loadForRuntime: (name) => values.get(name) };
  // Whatever the shell that started the launcher exported, including provider-like names, is never a connection.
  const environment = { BLITZ_API_KEY: "external-sentinel", CLAUDE_CODE_MESSAGING_TOKEN: "shell", GUM_LOG_KEY_BACKGROUND: "shell", PATH: "/bin" };
  const storage = localStorage({ journal, store, environment });
  let active = null;
  const manager = createManager({ journal, storage, active: async () => active, context: { mode: "local" } });
  return { journal, values, store, environment, manager, storage, setActive: (value) => active = value };
}
test("empty-workflow CRUD, managed precedence, tombstones and generation activation", async () => {
  const f = await fixture();
  try {
    let rows = (await f.manager.inventory()).connections;
    assert.deepEqual(rows, [], "environment variables are never listed");
    f.setActive({ generation: "0", connections: [{ id: "CLAUDE_CODE_MESSAGING_TOKEN", name: "x", configured: true, platformIdentity: false, usage: [], fields: [{ variable: "CLAUDE_CODE_MESSAGING_TOKEN" }] }] });
    assert.deepEqual((await f.manager.inventory()).connections, [], "nor what an older runner reports");
    f.setActive(null);
    await f.manager.change({ id: randomUUID(), variable: "BLITZ_API_KEY", action: "add", value: sentinel, version: "absent" }, "owner");
    rows = (await f.manager.inventory()).connections;
    assert.deepEqual(rows.map((row) => row.id), ["BLITZ_API_KEY"]); assert.equal(rows[0].fields[0].externalCopy, true);
    let env = await runtimeEnvironment(f); assert.equal(env.BLITZ_API_KEY, sentinel); assert.equal(env.GTM_CONNECTIONS_GENERATION, "1");
    rows = (await f.manager.inventory()).connections; assert.equal(rows[0].status, "Saved locally, runner not started");
    f.setActive({ generation: "1", connections: [{ id: "blitz", configured: true, usage: [], fields: [{ variable: "BLITZ_API_KEY" }] }] });
    assert.equal((await f.manager.inventory()).connections[0].status, "Configured");
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

test("explicit replacement supersedes an uncertain write even when timestamps are identical", async () => {
  const f = await fixture(), now = Date.now;
  const uncertain = { id: randomUUID(), variable: "CUSTOM_API_KEY", action: "add", value: sentinel, version: "absent" };
  try {
    Date.now = () => 1700000000000;
    f.store.set = (name, value) => { f.values.set(name, value); throw Error("lost native response"); };
    await assert.rejects(f.manager.change({ ...uncertain }, "owner"));
    f.store.set = (name, value) => f.values.set(name, value);
    const replacement = { id: randomUUID(), variable: "CUSTOM_API_KEY", action: "replace", value: "synthetic-replacement", version: `operation:${uncertain.id}`, supersede: true };
    await f.manager.change({ ...replacement }, "owner");
    assert.equal((await f.journal.operation(uncertain.id)).superseded_by, replacement.id);
    assert.equal((await runtimeEnvironment(f)).CUSTOM_API_KEY, replacement.value);
  } finally { Date.now = now; f.journal.close(); }
});
test("a crash before dispatch never blocks a new attempt or claims a native write happened", async () => {
  const f = await fixture(), abandoned = { id: randomUUID(), variable: "CUSTOM_API_KEY", action: "add", version: "absent" };
  try {
    await f.journal.prepare(abandoned, "owner", null);
    const lease = await f.journal.acquire(); await f.journal.release(lease);
    assert.equal((await f.journal.operation(abandoned.id)).phase, "failed");
    assert.equal((await runtimeEnvironment(f)).CUSTOM_API_KEY, undefined);
    assert.equal(f.values.size, 0);
  } finally { f.journal.close(); }
});

test("a stale worker cannot finalize saved metadata or release a replacement worker's lease", async () => {
  const f = await fixture(), now = Date.now;
  let clock = now(), nextLease;
  const input = { id: randomUUID(), variable: "CUSTOM_API_KEY", action: "add", value: sentinel, version: "absent" };
  try {
    Date.now = () => clock;
    f.store.set = async (name, value) => {
      f.values.set(name, value); clock += 61000;
      nextLease = await f.journal.acquire();
    };
    await assert.rejects(f.manager.change({ ...input }, "owner"), /save_outcome_requires_review/);
    assert.equal((await f.journal.operation(input.id)).phase, "unresolved");
    assert.equal((await f.journal.list()).length, 0);
    await f.journal.fence(nextLease);
    await assert.rejects(runtimeEnvironment(f), /resolve_connection_before_restart/);
    await f.journal.release(nextLease);
  } finally { Date.now = now; f.journal.close(); }
});
test("custom variable names and service labels survive a name-only edit and restart", async () => {
  const f = await fixture();
  try {
    await f.manager.change({ id: randomUUID(), variable: "hubspotProd", label: "HubSpot (Production)", action: "add", value: sentinel, version: "absent" }, "owner");
    let row = (await f.manager.inventory()).connections.find((row) => row.id === "hubspotProd");
    assert.equal(row.name, "HubSpot (Production)");
    await f.manager.change({ id: randomUUID(), variable: "hubspotProd", label: "HubSpot (Sandbox)", action: "replace", version: row.fields[0].version }, "owner");
    assert.equal(f.values.get("hubspotProd"), sentinel);
    row = (await f.manager.inventory()).connections.find((row) => row.id === "hubspotProd");
    assert.equal(row.name, "HubSpot (Sandbox)");
    const env = await runtimeEnvironment(f);
    assert.equal(env.hubspotProd, sentinel);
    assert.equal(inspectionEnvironment(env, ["hubspotProd"]).hubspotProd, undefined);
    assert.equal(JSON.parse(env.GTM_CONNECTIONS_LABELS).hubspotProd, "HubSpot (Sandbox)");
    assert.ok(!JSON.stringify(await f.manager.inventory()).includes(sentinel));
  } finally { f.journal.close(); }
});
