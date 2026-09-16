import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { workspaceState, writePrivateJson, privateJson } from "../local/state.mjs";
import { request as httpRequest } from "node:http";
import { startLocal } from "../local/server.mjs";
import { nativeStore } from "../local/storage.mjs";
test("real local HTTP and native credential CRUD never expose stored values", async () => {
  const root = await mkdtemp(join(homedir(), ".gtm-test-")), workspace = join(root, "workspace");
  await mkdir(workspace);
  const stateOptions = { create: true, root, boundary: root };
  const state = await workspaceState(workspace, stateOptions);
  await writePrivateJson(state.configPath, { workspace: state.workspace, workflowsUrl: "http://127.0.0.1:3939/viewer" });
  const store = nativeStore(state.id), sentinel = `synthetic-native-${randomUUID()}`;
  let server;
  try {
    server = await startLocal(workspace, { open: false, stateOptions, store, environment: {} });
    const transport = await privateJson(join(state.directory, "manager.json"));
    const ipc = (token) => new Promise((resolve, reject) => {
      const request = httpRequest({ socketPath: transport.ipcPath, path: "/connections", headers: token ? { authorization: `Bearer ${token}` } : {} }, (response) => {
        response.resume(); response.on("end", () => resolve(response.statusCode));
      }); request.on("error", reject); request.end();
    });
    assert.equal(await ipc(), 401);
    assert.equal(await ipc("wrong"), 401);
    assert.equal(await ipc(transport.ipcToken), 200);
    assert.equal((await fetch(`${server.origin}/api/connections`)).status, 401);
    assert.equal((await fetch(`${server.origin}/api/health`)).status, 401);
    assert.equal((await fetch(`${server.origin}/api/connections`, { headers: { "x-forwarded-host": "anything" } })).status, 403);
    const bootstrap = new URLSearchParams(new URL(server.auth.opener()).hash.slice(1)).get("bootstrap");
    const headers = { origin: server.origin, "sec-fetch-site": "same-origin", "content-type": "application/json" };
    const sessionResponse = await fetch(`${server.origin}/api/session`, { method: "POST", headers, body: JSON.stringify({ bootstrap }) });
    assert.equal(sessionResponse.status, 200); const session = await sessionResponse.json();
    const authenticated = { ...headers, authorization: `Bearer ${session.bearer}`, "x-gtm-csrf": session.csrf };
    const list = async () => {
      const response = await fetch(`${server.origin}/api/connections`, { headers: authenticated });
      assert.equal(response.status, 200); const text = await response.text(); assert.equal(text.includes(sentinel), false); return JSON.parse(text);
    };
    assert.equal((await list()).connections.length, 0);
    for (const [action, version] of [["add", "absent"], ["replace", "1"], ["disconnect", "2"]]) {
      const response = await fetch(`${server.origin}/api/connections`, { method: "POST", headers: authenticated,
        body: JSON.stringify({ id: randomUUID(), variable: "BLITZ_API_KEY", action, version, ...(action === "disconnect" ? {} : { value: sentinel }) }) });
      assert.equal(response.status, 200); assert.equal((await response.text()).includes(sentinel), false);
      await list();
    }
    assert.equal(store.loadForRuntime("BLITZ_API_KEY"), null);
    assert.equal((await readFile(state.database)).includes(Buffer.from(sentinel)), false);
    const denied = await fetch(`${server.origin}/api/connections`, { method: "POST", headers: { ...authenticated, "x-gtm-csrf": "wrong" }, body: "{}" }); assert.equal(denied.status, 403);
    await fetch(`${server.origin}/api/logout`, { method: "POST", headers: authenticated, body: "{}" });
    assert.equal((await fetch(`${server.origin}/api/connections`, { headers: authenticated })).status, 401);
  } finally {
    store.remove("BLITZ_API_KEY"); if (server) await server.close(); await rm(root, { recursive: true, force: true });
  }
});
