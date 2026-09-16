import test from "node:test";
import assert from "node:assert/strict";
import { privateConnectionBrowser, connectionConfiguration, CONNECTION_ACCESS_PROBE } from "../templates/lib/connections-access";
import { connectionMetadata, changeConnection, connectionsVercel } from "../templates/lib/connections-management";
const config = { origin: "https://private.example.com", teamId: "team_test", projectId: "prj_test", token: "synthetic-project-token" };
const claims = { sub: "sso-protection", userId: "human", ownerId: config.teamId, aud: "private.example.com" };
const cookie = (value = claims) => `_vercel_jwt=${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(value)).toString('base64url')}.synthetic`;
const request = (headers: Record<string, string> = {}, method = "GET", query = "") => new Request(`${config.origin}/api/connection-management${query}`, { method, headers: { cookie: cookie(), ...headers } });
const probe: typeof fetch = async (_url, init) => new Response(init?.headers ? CONNECTION_ACCESS_PROBE : "", { status: init?.headers ? 200 : 401 });
test("native browser requires independent edge validation and anonymous denial", async () => {
  const calls: any[] = [];
  const result = await privateConnectionBrowser(request(), config, async (url, init) => { calls.push({ url, init }); return probe(url, init); });
  assert.ok(result.csrf);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].init.headers, { cookie: cookie() });
  assert.ok(calls.every((call) => call.url === `${config.origin}/api/connection-access` && call.init.redirect === "manual"));
  await assert.rejects(privateConnectionBrowser(request(), config, async () => new Response(CONNECTION_ACCESS_PROBE)), /deployment_protection_required/);
  await assert.rejects(privateConnectionBrowser(request(), config, async () => new Response("", { status: 401 })), /private_browser_required/);
  await assert.rejects(privateConnectionBrowser(request(), config, async () => { throw Error("network"); }), /access_verification_unavailable/);
});
test("automation, share cookies, bearer and workload bypasses never grant management", async () => {
  let calls = 0;
  const noProbe: typeof fetch = async () => { calls++; throw Error("must not probe"); };
  for (const headers of [
    { cookie: "" }, { cookie: `${cookie()}; ${cookie()}` }, { cookie: cookie({ ...claims, bypass: false } as any) },
    { cookie: cookie({ ...claims, sub: "share-link" }) }, { cookie: cookie({ ...claims, ownerId: "other" }) },
    { authorization: "Bearer synthetic" }, { "x-vercel-protection-bypass": "synthetic" }, { "x-vercel-trusted-oidc-idp-token": "synthetic" },
  ]) await assert.rejects(privateConnectionBrowser(request(headers), config, noProbe), /private_browser_required/);
  await assert.rejects(privateConnectionBrowser(request({}, "GET", "?x-vercel-protection-bypass=synthetic"), config, noProbe));
  assert.equal(calls, 0);
});
test("writes require same-origin browser CSRF bound to native session", async () => {
  const { csrf } = await privateConnectionBrowser(request(), config, probe);
  const headers = { origin: config.origin, "sec-fetch-site": "same-origin", "content-type": "application/json", "x-gtm-csrf": csrf };
  await privateConnectionBrowser(request(headers, "POST"), config, probe);
  for (const change of [{ origin: "https://outside.example.com" }, { "sec-fetch-site": "cross-site" }, { "x-gtm-csrf": "forged" }])
    await assert.rejects(privateConnectionBrowser(request({ ...headers, ...change }, "POST"), config, probe), /csrf_denied/);
});
test("configuration excludes share, preview and unprotected deployments", () => {
  const env = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: config.projectId, GTM_VIEWER_PROTECTED: "1", GTM_CONNECTIONS_ENABLED: "1", GTM_CONNECTIONS_ORIGIN: config.origin, GTM_CONNECTIONS_TEAM_ID: config.teamId, GTM_CONNECTIONS_VERCEL_TOKEN: config.token };
  assert.deepEqual(connectionConfiguration(env), config);
  for (const change of [{ GTM_VIEWER_MODE: "share" }, { VERCEL_ENV: "preview" }, { GTM_VIEWER_PROTECTED: "0" }]) assert.throws(() => connectionConfiguration({ ...env, ...change }));
});
const raw = { id: "env_test", key: "APOLLO_API_KEY", target: ["production"], updatedAt: 1, value: "NEVER_RETURN_THIS_KEY", decryptedValue: "NEVER_RETURN_THIS_KEY" };
test("inventory drops values and marks shared, duplicate and multi-target keys read-only", async () => {
  const rows = await connectionMetadata(async (_method, path) => {
    assert.match(path, /decrypt=false/);
    return { envs: [raw, { ...raw, id: "shared", key: "BLITZ_API_KEY", sharedEnvVariableId: "shared" }, { ...raw, id: "multi", key: "MONID_API_KEY", target: ["production", "preview"] }, { ...raw, key: "GTM_CONNECTIONS_VERCEL_TOKEN" }] };
  }, config.projectId);
  assert.equal(rows.length, 3); assert.equal(rows[0].editable, true);
  assert.equal(rows[1].editable, false); assert.equal(rows[2].editable, false);
  assert.ok(!JSON.stringify(rows).includes("NEVER_RETURN"));
  const duplicate = await connectionMetadata(async () => ({ envs: [raw, { ...raw, id: "duplicate" }] }), config.projectId);
  assert.ok(duplicate.every((row) => !row.editable));
});
test("writes reject stale versions, infrastructure and multi-target configuration", async () => {
  const api = async (method: string) => { assert.equal(method, "GET"); return { envs: [raw] }; };
  await assert.rejects(changeConnection(api, config.projectId, { variable: raw.key, action: "replace", version: "stale", value: "synthetic" }), /connection_changed/);
  await assert.rejects(changeConnection(api, config.projectId, { variable: "GTM_SECRET_API_KEY", action: "add", version: "absent", value: "synthetic" }), /invalid_provider_variable/);
  await assert.rejects(changeConnection(async () => ({ envs: [{ ...raw, target: ["production", "preview"] }] }), config.projectId, { variable: raw.key, action: "disconnect", version: "env_test:1" }), /use_vercel_settings/);
});
test("replacement writes production Secret and preserves existing comment", async () => {
  const writes: any[] = [];
  const api = async (method: string, path: string, body?: any) => {
    if (method === "GET") return { envs: [{ ...raw, comment: "Existing customization" }] };
    writes.push({ method, path, body: structuredClone(body) }); return {};
  };
  const input = { variable: raw.key, action: "replace", version: "env_test:1", value: "synthetic-new-key" };
  assert.deepEqual(await changeConnection(api, config.projectId, input), { saved: true, requiresDeployment: true });
  assert.equal(input.value, undefined); assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].body, { value: "synthetic-new-key", type: "sensitive", visibility: "secret", target: ["production"], comment: "Existing customization" });
});
test("unknown write outcomes are redacted and never automatically retried", async () => {
  let calls = 0;
  const api = connectionsVercel(config, async () => { calls++; throw Error("secret-bearing upstream error"); });
  await assert.rejects(api("POST", "/v10/projects/prj_test/env", { value: "synthetic" }), /save_outcome_requires_review/);
  assert.equal(calls, 1);
});
