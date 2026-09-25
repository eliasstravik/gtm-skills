import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openJournal } from "../src/journal.mjs";
import { localStorage } from "../local/storage.mjs";
import { createManager } from "../src/manager.mjs";
import { createProduction, ownerCli } from "../local/production.mjs";
import { workspaceState, writePrivateJson } from "../local/state.mjs";
import { startLocal } from "../local/server.mjs";
const sentinel = `synthetic-push-${randomUUID()}`;
const linked = { projectId: "prj_1", team: "acme", origin: "https://gtm-acme.vercel.app", workflowName: "gtm-acme", mode: "private-project", teamId: "team_1" };

/** A stand-in Vercel project: env rows, calls recorded. */
function vercel(envs) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body: body === undefined ? undefined : structuredClone(body) });
    if (method === "GET" && path.includes("/env?decrypt=false")) return { envs: structuredClone(envs) };
    if (method === "GET" && path.startsWith("/v9/projects/")) return { id: "prj_1", name: "gtm-acme" };
    if (method === "GET" && path.startsWith("/v4/aliases/")) return { projectId: "prj_1", deployment: { id: "dpl_live" } };
    if (method === "POST" && path.startsWith("/v13/deployments")) return { id: "dpl_new", readyState: "QUEUED" };
    return { created: { id: "env_new" } };
  };
  return { api, calls };
}
async function fixture({ production = linked, envs = [] } = {}) {
  const root = await mkdtemp(join(homedir(), ".gtm-test-")), workspace = join(root, "workspace");
  await mkdir(workspace);
  const stateOptions = { create: true, root, boundary: root };
  const state = await workspaceState(workspace, stateOptions);
  await writePrivateJson(state.configPath, { workspace: state.workspace, workflowsUrl: "http://127.0.0.1:3939/viewer", ...(production ? { production } : {}) });
  const journal = await openJournal({ url: ":memory:" }), values = new Map();
  const store = { set: (name, value) => values.set(name, value), remove: (name) => values.delete(name), loadForRuntime: (name) => values.get(name) ?? null };
  const storage = localStorage({ journal, store, environment: {} });
  const manager = createManager({ journal, storage, active: async () => null, context: { mode: "local" } });
  const remote = vercel(envs);
  const production_ = createProduction({ state, store, storage, api: remote.api });
  const done = async () => { journal.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); };
  return { root, workspace, stateOptions, state, store, manager, remote, production: production_, done };
}
const marker = (names) => ({ id: "env_marker", key: "GTM_CONNECTIONS_MANAGED", type: "plain", target: ["production"], value: JSON.stringify(names) });
const secret = (key, extra = {}) => ({ id: `env_${key}`, key, type: "sensitive", target: ["production"], ...extra });

test("hints list only the names production saved through Connections, and nothing when not linked", async () => {
  const f = await fixture({ envs: [marker(["APOLLO_API_KEY", "GONE_API_KEY"]), secret("APOLLO_API_KEY"), secret("OTHER_API_KEY"), secret("PREVIEW_KEY", { target: ["preview"] })] });
  try {
    assert.deepEqual(await f.production.names(), { linked: true, project: "gtm-acme", url: "https://gtm-acme.vercel.app/connections", names: ["APOLLO_API_KEY"] });
    assert.ok(f.remote.calls.every((call) => call.method === "GET" && !call.path.includes("decrypt=true")), "only reads, never decrypts");
  } finally { await f.done(); }
  const g = await fixture({ production: null });
  try { assert.deepEqual(await g.production.names(), { linked: false }); assert.equal(g.remote.calls.length, 0); } finally { await g.done(); }
});

test("push sends a new key as a sensitive production-only variable, lists its name and redeploys the serving code", async () => {
  const f = await fixture({ envs: [marker(["ZED_API_KEY"])] });
  try {
    await f.manager.change({ id: randomUUID(), variable: "APOLLO_API_KEY", action: "add", label: "Apollo", value: sentinel, version: "absent" }, "owner");
    const id = randomUUID(), result = await f.production.push({ id, variable: "APOLLO_API_KEY" });
    assert.deepEqual(result, { pushed: true, replaced: false, application: "applying", url: "https://gtm-acme.vercel.app/connections" });
    const writes = f.remote.calls.filter((call) => call.method !== "GET");
    assert.deepEqual(writes[0], { method: "PATCH", path: "/v9/projects/prj_1/env/env_marker",
      body: { value: '["APOLLO_API_KEY","ZED_API_KEY"]', type: "plain", target: ["production"], comment: "Keys saved through Connections" } });
    assert.deepEqual(writes[1], { method: "POST", path: "/v10/projects/prj_1/env",
      body: { value: sentinel, type: "sensitive", visibility: "secret", target: ["production"], comment: "Apollo", key: "APOLLO_API_KEY" } });
    assert.deepEqual(writes[2], { method: "POST", path: "/v13/deployments?forceNew=1",
      body: { name: "gtm-acme", project: "prj_1", deploymentId: "dpl_live", target: "production", withLatestCommit: false, meta: { gtmConnectionsChange: id } } });
    assert.equal(JSON.stringify(result).includes(sentinel), false);
  } finally { await f.done(); }
});

test("push creates the marker when production has none", async () => {
  const f = await fixture();
  try {
    await f.manager.change({ id: randomUUID(), variable: "APOLLO_API_KEY", action: "add", label: "Apollo", value: sentinel, version: "absent" }, "owner");
    await f.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY" });
    assert.deepEqual(f.remote.calls.find((call) => call.method === "POST").body,
      { value: '["APOLLO_API_KEY"]', type: "plain", target: ["production"], comment: "Keys saved through Connections", key: "GTM_CONNECTIONS_MANAGED" });
  } finally { await f.done(); }
});

test("an existing production key is replaced only when confirmed, and never one Vercel manages elsewhere", async () => {
  const f = await fixture({ envs: [marker(["APOLLO_API_KEY"]), secret("APOLLO_API_KEY", { comment: "Apollo" }), secret("SHARED_API_KEY", { target: ["production", "preview"] })] });
  try {
    for (const variable of ["APOLLO_API_KEY", "SHARED_API_KEY"])
      await f.manager.change({ id: randomUUID(), variable, action: "add", label: variable, value: sentinel, version: "absent" }, "owner");
    await assert.rejects(f.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY" }), /production_key_exists/);
    assert.equal(f.remote.calls.filter((call) => call.method !== "GET").length, 0);
    await assert.rejects(f.production.push({ id: randomUUID(), variable: "SHARED_API_KEY", replace: true }), /use_vercel_settings/);
    const result = await f.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY", replace: true });
    assert.equal(result.replaced, true);
    const writes = f.remote.calls.filter((call) => call.method !== "GET");
    assert.equal(writes[0].method, "PATCH"); assert.equal(writes[0].path, "/v9/projects/prj_1/env/env_APOLLO_API_KEY");
    assert.equal(writes.length, 2, "already listed, so only the key and the redeploy");
  } finally { await f.done(); }
});

test("push refuses keys not saved here, bad input and an unlinked workspace", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY" }), /local_key_not_saved/);
    await assert.rejects(f.production.push({ id: randomUUID(), variable: "GTM_RUN_SECRET" }), /invalid_provider_variable/);
    await assert.rejects(f.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY", value: sentinel }), /unknown_field/);
    assert.equal(f.remote.calls.length, 0);
  } finally { await f.done(); }
  const g = await fixture({ production: null });
  try { await assert.rejects(g.production.push({ id: randomUUID(), variable: "APOLLO_API_KEY" }), /production_not_linked/); } finally { await g.done(); }
});

test("a failed redeploy still reports the saved push, so the tab asks for a redeploy", async () => {
  const f = await fixture();
  try {
    f.store.set("APOLLO_API_KEY", sentinel);
    const failing = async (method, path, body) => { if (path.startsWith("/v13/")) throw Error("down"); return f.remote.api(method, path, body); };
    const production = createProduction({ state: f.state, store: f.store, storage: { list: async () => [{ variable: "APOLLO_API_KEY", state: "saved", label: "Apollo" }] }, api: failing });
    assert.deepEqual(await production.push({ id: randomUUID(), variable: "APOLLO_API_KEY" }), { pushed: true, replaced: false, application: "failed", url: "https://gtm-acme.vercel.app/connections" });
  } finally { await f.done(); }
});

test("the CLI gets the value on stdin, never in its arguments, and none of the launcher's keys", async () => {
  const root = await mkdtemp(join(homedir(), ".gtm-test-"));
  const script = join(root, "vercel.cjs"), log = join(root, "log.json"), command = [process.execPath, script];
  await writeFile(script, `let input = ""; process.stdin.on("data", (c) => input += c).on("end", () => {
  require("node:fs").writeFileSync(${JSON.stringify(log)}, JSON.stringify({ argv: process.argv.slice(2), input, env: Object.keys(process.env) }));
  process.stdout.write('<claude-code-hint note="x"/>\\n{"ok":true}\\n');
});\n`);
  process.env.APOLLO_API_KEY = sentinel;
  try {
    const api = ownerCli("acme", command);
    assert.deepEqual(await api("POST", "/v10/projects/prj_1/env", { key: "APOLLO_API_KEY", value: sentinel }), { ok: true });
    const seen = JSON.parse(await readFile(log, "utf8"));
    assert.deepEqual(seen.argv, ["api", "/v10/projects/prj_1/env", "--method", "POST", "--raw", "--non-interactive", "--scope", "acme", "--input", "-"]);
    assert.equal(JSON.parse(seen.input).value, sentinel);
    assert.equal(seen.env.includes("APOLLO_API_KEY"), false);
    await assert.rejects(ownerCli("acme", [join(root, "missing")])("GET", "/v2/user"), /production_unavailable/);
    assert.throws(() => ownerCli("acme; rm -rf /"), /production_not_linked/);
  } finally { delete process.env.APOLLO_API_KEY; await rm(root, { recursive: true, force: true }); }
});

test("the local manager serves hints and pushes only to a signed-in, same-origin page with its CSRF token", async () => {
  const f = await fixture({ envs: [marker(["APOLLO_API_KEY"]), secret("APOLLO_API_KEY")] });
  let server;
  try {
    server = await startLocal(f.workspace, { open: false, publish: false, stateOptions: f.stateOptions, store: f.store, environment: {}, productionApi: f.remote.api });
    const bootstrap = new URLSearchParams(new URL(server.auth.opener()).hash.slice(1)).get("bootstrap");
    const headers = { origin: server.origin, "sec-fetch-site": "same-origin", "content-type": "application/json" };
    const session = await (await fetch(`${server.origin}/api/session`, { method: "POST", headers, body: JSON.stringify({ bootstrap }) })).json();
    const signed = { ...headers, authorization: `Bearer ${session.bearer}`, "x-gtm-csrf": session.csrf };
    assert.equal((await fetch(`${server.origin}/api/production`)).status, 401);
    assert.deepEqual((await (await fetch(`${server.origin}/api/production`, { headers: signed })).json()).names, ["APOLLO_API_KEY"]);
    await fetch(`${server.origin}/api/connections`, { method: "POST", headers: signed, body: JSON.stringify({ id: randomUUID(), variable: "APOLLO_API_KEY", action: "add", label: "Apollo", value: sentinel, version: "absent" }) });
    const push = (extra, body = { id: randomUUID(), variable: "APOLLO_API_KEY", replace: true }) => fetch(`${server.origin}/api/production/push`, { method: "POST", headers: { ...signed, ...extra }, body: JSON.stringify(body) });
    assert.equal((await push({ "x-gtm-csrf": "wrong" })).status, 403);
    assert.equal((await push({ origin: "https://evil.example" })).status, 403);
    assert.equal((await push({ "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal(f.remote.calls.filter((call) => call.method !== "GET").length, 0);
    assert.equal((await push({}, { id: randomUUID(), variable: "APOLLO_API_KEY" })).status, 409, "an existing key needs the confirmation");
    const response = await push({});
    assert.equal(response.status, 200); assert.equal((await response.text()).includes(sentinel), false);
  } finally { if (server) await server.close(); await f.done(); }
});
