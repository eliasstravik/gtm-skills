import test from "node:test";
import assert from "node:assert/strict";
import { applyConnections, connectionDeployment } from "../templates/lib/connections-apply";
import { changeAndApplyConnection } from "../templates/lib/connections-management";
const id = "cd145659-2da3-40af-86af-49febc08e67d", projectId = "prj_test";
const origin = "https://workflows.example.com";
const serving = { id: "dpl_serving", readyState: "READY" };
function fixture({ latest = { uid: serving.id, state: "READY", meta: {} }, createFails = false, writeFails = false } : any = {}) {
  const writes: any[] = [];
  const api = async (method: string, path: string, body?: any): Promise<any> => {
    if (method === "GET" && path.includes("/env")) return { envs: [{ id: "env_test", key: "APOLLO_API_KEY", target: ["production"], updatedAt: 1 }] };
    if (method === "GET" && path.includes("/projects/")) return { id: projectId, name: "workflows", targets: { production: { id: "dpl_not_serving", readyState: "BUILDING" } }, secret: "never-return" };
    if (method === "GET" && path.includes("/aliases/")) return { projectId, deployment: serving };
    if (method === "GET" && path.includes("/deployments?")) return { deployments: [latest] };
    writes.push({ method, path, body: structuredClone(body) });
    if (path.includes("/deployments")) { if (createFails) throw Error("secret upstream error"); return { id: "dpl_new", readyState: "QUEUED" }; }
    if (writeFails) throw Error("save_outcome_requires_review");
    return {};
  };
  return { api, writes };
}
const change = () => ({ id, variable: "APOLLO_API_KEY", action: "replace", version: "env_test:1", value: "synthetic-key" });
test("key changes rebuild serving code after saving, with no secrets in deployment metadata", async () => {
  const { api, writes } = fixture();
  const input = change();
  assert.deepEqual((await changeAndApplyConnection(api, projectId, input, origin)).application, { state: "applying", id });
  assert.equal(input.value, undefined);
  assert.match(writes[0].path, /\/env\//);
  assert.deepEqual(writes[1], { method: "POST", path: "/v13/deployments?forceNew=1", body: { name: "workflows", project: projectId, deploymentId: serving.id, target: "production", withLatestCommit: false, meta: { gtmConnectionsChange: id } } });
});
test("add and delete apply automatically; renaming never touches deployments", async () => {
  for (const action of ["add", "disconnect"]) {
    const { api, writes } = fixture();
    const input = action === "add" ? { id, action, variable: "CUSTOM", version: "absent", value: "synthetic" } : { ...change(), action, value: undefined };
    assert.equal((await changeAndApplyConnection(api, projectId, input, origin)).application?.state, "applying");
    assert.match(writes.at(-1).path, /deployments/);
  }
  let calls = 0;
  const result = await changeAndApplyConnection(async (method, path) => {
    calls++; assert.match(path, /\/env/);
    return method === "GET" ? { envs: [{ id: "env_test", key: "APOLLO_API_KEY", target: ["production"], updatedAt: 1 }] } : {};
  }, projectId, { ...change(), value: undefined, label: "Apollo" }, origin);
  assert.equal(calls, 2); assert.equal(result.requiresDeployment, false); assert.equal(result.application, undefined);
});
test("a saved key survives update failure; Retry does not submit the key again", async () => {
  const { api, writes } = fixture({ createFails: true });
  const result = await changeAndApplyConnection(api, projectId, change(), origin);
  assert.equal(result.saved, true); assert.deepEqual(result.application, { id, state: "failed" });
  assert.ok(!JSON.stringify(result).includes("secret"));
  writes.length = 0;
  await changeAndApplyConnection(api, projectId, { action: "apply", id }, origin);
  assert.equal(writes.length, 1); assert.match(writes[0].path, /deployments/);
});
test("a retry reuses its pending build; a later key change starts a fresh build", async () => {
  const { api, writes } = fixture({ latest: { uid: "dpl_new", state: "BUILDING", meta: { gtmConnectionsChange: id } } });
  assert.deepEqual(await applyConnections(api, projectId, id, origin), { id, state: "applying" });
  assert.equal(writes.length, 0);
  const nextId = "5675a4b6-6dc0-452f-a365-78cb87233cd5";
  const result = await changeAndApplyConnection(api, projectId, { ...change(), id: nextId }, origin);
  assert.equal(result.saved, true);
  assert.deepEqual(result.application, { id: nextId, state: "applying" });
  assert.equal(writes.length, 2);
  assert.match(writes[0].path, /\/env\//);
  assert.equal(writes[1].body.meta.gtmConnectionsChange, nextId);
  assert.equal(writes[1].body.deploymentId, serving.id);
});
test("only serving READY means applied, not merely a successful build", async () => {
  for (const [uid, state, expected] of [[serving.id, "READY", "applied"], ["other", "READY", "failed"], ["other", "ERROR", "failed"], ["other", "CANCELED", "failed"], ["other", "QUEUED", "applying"]]) {
    const { api } = fixture({ latest: { uid, state, meta: { gtmConnectionsChange: id } } });
    const result = await connectionDeployment(api, projectId, origin);
    assert.equal(result.application.state, expected); assert.ok(!JSON.stringify(result).includes("never-return"));
  }
  const { api, writes } = fixture({ latest: { uid: serving.id, state: "READY", meta: { gtmConnectionsChange: id } } });
  assert.equal((await applyConnections(api, projectId, id, origin)).state, "applied"); assert.equal(writes.length, 0);
});
test("uncertain secret writes never start a deployment or resubmit automatically", async () => {
  const { api, writes } = fixture({ writeFails: true });
  await assert.rejects(changeAndApplyConnection(api, projectId, change(), origin), /save_outcome_requires_review/);
  assert.equal(writes.length, 1); assert.match(writes[0].path, /\/env\//);
});
test("client input cannot select another project, source, or latest commit", async () => {
  const { api, writes } = fixture();
  await changeAndApplyConnection(api, projectId, { action: "apply", id, project: "attacker", deploymentId: "attacker", withLatestCommit: true }, origin);
  assert.equal(writes[0].body.project, projectId); assert.equal(writes[0].body.deploymentId, serving.id); assert.equal(writes[0].body.withLatestCommit, false);
  await assert.rejects(changeAndApplyConnection(api, projectId, { action: "apply", id: "invalid" }, origin), /invalid_change/);
});

test("an alias belonging to another project cannot select deployment source", async () => {
  const { api, writes } = fixture();
  const scoped = (method: string, path: string, body?: unknown) => path.includes('/aliases/') ? Promise.resolve({ projectId: 'other', deployment: serving }) : api(method, path, body);
  assert.equal((await applyConnections(scoped, projectId, id, origin)).state, "failed");
  assert.equal(writes.length, 0);
});
