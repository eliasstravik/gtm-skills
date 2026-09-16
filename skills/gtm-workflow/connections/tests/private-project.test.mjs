import test from "node:test";
import assert from "node:assert/strict";
import { configurePrivateProject } from "../setup/private-project.mjs";
const project = { id: "prj_test", name: "test-workflows", accountId: "team_test", ssoProtection: { deploymentType: "all" } };
test("private Connections configures only an existing project, without resource provisioning", async () => {
  const calls = [], saved = new Map();
  const store = { loadForRuntime: (key) => saved.get(key), set: (key, value) => saved.set(key, value) };
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === "GET") { assert.match(path, /^\/v10\/projects\/prj_test\/env\?decrypt=false$/); return { envs: [] }; }
    if (path === "/v3/user/tokens") { assert.equal(body.projectId, project.id); return { bearerToken: "synthetic-token", token: { projectId: project.id } }; }
    assert.equal(path, "/v10/projects/prj_test/env");
    return { id: `env_${body.key}`, visibility: body.visibility };
  };
  const result = await configurePrivateProject({ api, project, store });
  assert.equal(result.mode, "private-project");
  assert.equal(calls.filter((call) => call.path === "/v3/user/tokens").length, 1);
  const tokenWrite = calls.find((call) => call.body?.key === "GTM_CONNECTIONS_VERCEL_TOKEN");
  assert.deepEqual(tokenWrite.body.target, ["production"]);
  assert.equal(tokenWrite.body.type, "sensitive"); assert.equal(tokenWrite.body.visibility, "secret");
  assert.ok(!JSON.stringify(result).includes("synthetic-token"));
});
test("setup refuses unprotected projects and deployment-wide share links", async () => {
  const api = async () => { throw Error("must not mutate"); };
  await assert.rejects(configurePrivateProject({ api, project: { ...project, ssoProtection: null } }), /protect_all_deployments_first/);
  await assert.rejects(configurePrivateProject({ api, project: { ...project, protectionBypass: { synthetic: { scope: "shareable-link" } } } }), /remove_deployment_share_links_first/);
});
test("setup preserves an existing production Secret instead of replacing it", async () => {
  const api = async (method, path, body) => {
    assert.notEqual(path, "/v3/user/tokens");
    if (method === "GET") return { envs: [{ id: "env_existing", key: "GTM_CONNECTIONS_VERCEL_TOKEN", target: ["production"], type: "sensitive", visibility: "secret" }] };
    assert.notEqual(body?.key, "GTM_CONNECTIONS_VERCEL_TOKEN"); return { id: "env_config", visibility: "config" };
  };
  await configurePrivateProject({ api, project });
});
