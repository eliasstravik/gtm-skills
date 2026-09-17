import test from "node:test";
import assert from "node:assert/strict";
import { applyConnections, connectionDeployment } from "../templates/lib/connections-apply";
import { changeAndApplyConnection } from "../templates/lib/connections-management";
const id = "cd145659-2da3-40af-86af-49febc08e67d", projectId = "prj_test";
const serving = { id: "dpl_serving", readyState: "READY" };
function fixture({ latest = { uid: serving.id, state: "READY", meta: {} }, createFails = false, writeFails = false } : any = {}) {
  const writes: any[] = [];
  const api = async (method: string, path: string, body?: any): Promise<any> => {
    if (method === "GET" && path.includes("/env")) return { envs: [{ id: "env_test", key: "APOLLO_API_KEY", target: ["production"], updatedAt: 1 }] };
    if (method === "GET" && path.includes("/projects/")) return { id: projectId, name: "workflows", targets: { production: serving }, secret: "never-return" };
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
  assert.deepEqual((await changeAndApplyConnection(api, projectId, input)).application, { state: "applying", id });
  assert.equal(input.value, undefined);
  assert.match(writes[0].path, /\/env\//);
  assert.deepEqual(writes[1], { method: "POST", path: "/v13/deployments?forceNew=1", body: { name: "workflows", project: projectId, deploymentId: serving.id, target: "production", withLatestCommit: false, meta: { gtmConnectionsChange: id } } });
});
test("add and delete apply automatically; renaming never touches deployments", async () => {
  for (const action of ["add", "disconnect"]) {
    const { api, writes } = fixture();
    const input = action === "add" ? { id, action, variable: "CUSTOM", version: "absent", value: "synthetic" } : { ...change(), action, value: undefined };
    assert.equal((await changeAndApplyConnection(api, projectId, input)).application?.state, "applying");
    assert.match(writes.at(-1).path, /deployments/);
  }
  let calls = 0;
  const result = await changeAndApplyConnection(async (method, path) => {
    calls++; assert.match(path, /\/env/);
    return method === "GET" ? { envs: [{ id: "env_test", key: "APOLLO_API_KEY", target: ["production"], updatedAt: 1 }] } : {};
  }, projectId, { ...change(), value: undefined, label: "Apollo" });
  assert.equal(calls, 2); assert.equal(result.requiresDeployment, false); assert.equal(result.application, undefined);
});
test("a saved key survives update failure; Retry does not submit the key again", async () => {
  const { api, writes } = fixture({ createFails: true });
  const result = await changeAndApplyConnection(api, projectId, change());
  assert.equal(result.saved, true); assert.deepEqual(result.application, { id, state: "failed" });
  assert.ok(!JSON.stringify(result).includes("secret"));
  writes.length = 0;
  await changeAndApplyConnection(api, projectId, { action: "apply", id });
  assert.equal(writes.length, 1); assert.match(writes[0].path, /deployments/);
});
test("pending updates block further key writes and retries reuse them", async () => {
  const { api, writes } = fixture({ latest: { uid: "dpl_new", state: "BUILDING", meta: { gtmConnectionsChange: id } } });
  await assert.rejects(changeAndApplyConnection(api, projectId, change()), /application_in_progress/);
  assert.deepEqual(await applyConnections(api, projectId, id), { id, state: "applying" });
  assert.equal(writes.length, 0);
});
test("only serving READY means applied, not merely a successful build", async () => {
  for (const [uid, state, expected] of [[serving.id, "READY", "applied"], ["other", "READY", "failed"], ["other", "ERROR", "failed"], ["other", "CANCELED", "failed"], ["other", "QUEUED", "applying"]]) {
    const { api } = fixture({ latest: { uid, state, meta: { gtmConnectionsChange: id } } });
    const result = await connectionDeployment(api, projectId);
    assert.equal(result.application.state, expected); assert.ok(!JSON.stringify(result).includes("never-return"));
  }
  const { api, writes } = fixture({ latest: { uid: serving.id, state: "READY", meta: { gtmConnectionsChange: id } } });
  assert.equal((await applyConnections(api, projectId, id)).state, "applied"); assert.equal(writes.length, 0);
});
test("uncertain secret writes never start a deployment or resubmit automatically", async () => {
  const { api, writes } = fixture({ writeFails: true });
  await assert.rejects(changeAndApplyConnection(api, projectId, change()), /save_outcome_requires_review/);
  assert.equal(writes.length, 1); assert.match(writes[0].path, /\/env\//);
});
test("client input cannot select another project, source, or latest commit", async () => {
  const { api, writes } = fixture();
  await changeAndApplyConnection(api, projectId, { action: "apply", id, project: "attacker", deploymentId: "attacker", withLatestCommit: true });
  assert.equal(writes[0].body.project, projectId); assert.equal(writes[0].body.deploymentId, serving.id); assert.equal(writes[0].body.withLatestCommit, false);
  await assert.rejects(changeAndApplyConnection(api, projectId, { action: "apply", id: "invalid" }), /invalid_change/);
});
