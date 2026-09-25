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
// The tab's own record of what it saved; a plain variable, so Vercel returns its value.
const marker = (...keys: string[]) => ({ id: "env_marker", key: "GTM_CONNECTIONS_MANAGED", type: "plain", target: ["production"], updatedAt: 1, value: JSON.stringify(keys) });
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
test("inventory hides the variables the Neon integration injects", async () => {
  // Vercel stores these as sensitive with no integration marker, so only their names can exclude them.
  const neon = ["NEON_PROJECT_ID", "DATABASE_URL", "DATABASE_URL_UNPOOLED", "PGHOST", "PGHOST_UNPOOLED", "PGUSER", "PGDATABASE", "PGPASSWORD",
    "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "POSTGRES_URL_NO_SSL", "POSTGRES_PRISMA_URL", "POSTGRES_HOST", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DATABASE"];
  const rows = await connectionMetadata(async () => ({ envs: [raw, ...neon.map((key) => ({ ...raw, id: key, key, type: "sensitive" }))] }), config.projectId);
  assert.deepEqual(rows.map((row) => row.variable), [raw.key]);
});
test("writes reject stale versions, infrastructure and multi-target configuration", async () => {
  const api = async (method: string) => { assert.equal(method, "GET"); return { envs: [raw, marker(raw.key)] }; };
  await assert.rejects(changeConnection(api, config.projectId, { variable: raw.key, action: "replace", version: "stale", value: "synthetic" }), /connection_changed/);
  await assert.rejects(changeConnection(api, config.projectId, { variable: "GTM_SECRET_API_KEY", action: "add", version: "absent", value: "synthetic" }), /invalid_provider_variable/);
  await assert.rejects(changeConnection(async () => ({ envs: [{ ...raw, target: ["production", "preview"] }, marker(raw.key)] }), config.projectId, { variable: raw.key, action: "disconnect", version: "env_test:1" }), /use_vercel_settings/);
});
test("replacement writes production Secret and preserves existing comment", async () => {
  const writes: any[] = [];
  const api = async (method: string, path: string, body?: any) => {
    if (method === "GET") return { envs: [{ ...raw, comment: "Existing customization" }, marker(raw.key)] };
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
test("custom names persist in Notes; editing a name never reads or replaces the secret", async () => {
  const writes: any[] = [];
  const api = async (method: string, _path: string, body?: any) => {
    if (method === "GET") return { envs: [{ ...raw, key: "HUBSPOT_PROD_KEY", type: "sensitive", comment: "HubSpot" }, marker("HUBSPOT_PROD_KEY")] };
    writes.push(structuredClone(body)); return {};
  };
  await changeConnection(api, config.projectId, { variable: "HUBSPOT_PROD_KEY", action: "replace", label: "HubSpot (Production)", version: "env_test:1" });
  assert.deepEqual(writes, [{ target: ["production"], comment: "HubSpot (Production)" }]);
  const rows = await connectionMetadata(async () => ({ envs: [{ ...raw, key: "customCredential", type: "sensitive", comment: "HubSpot (Sandbox)" }] }), config.projectId);
  assert.equal(rows[0].variable, "customCredential"); assert.equal(rows[0].comment, "HubSpot (Sandbox)");
  assert.ok(!JSON.stringify(rows).includes(raw.value));
});
test("adding custom keys stores the name as a Note and keeps system controls reserved", async () => {
  let saved: any;
  const api = async (method: string, _path: string, body?: any) => {
    if (method === "GET") return { envs: [] };
    saved = structuredClone(body); return {};
  };
  await changeConnection(api, config.projectId, { variable: "hubspotSandbox", action: "add", label: "HubSpot (Sandbox)", version: "absent", value: "synthetic-only" });
  assert.equal(saved.key, "hubspotSandbox"); assert.equal(saved.comment, "HubSpot (Sandbox)"); assert.equal(saved.visibility, "secret");
  for (const variable of ["PATH", "NODE_OPTIONS", "HOME", "VERCEL_TOKEN", "GTM_RUN_SECRET", "DATABASE_URL", "PGHOST", "PGPASSWORD", "POSTGRES_URL", "__bad-name"])
    await assert.rejects(changeConnection(api, config.projectId, { variable, action: "add", label: "Example", version: "absent", value: "synthetic" }), /invalid_provider_variable/);
});

test("name-only changes need no deployment", async () => {
  const result = await changeConnection(async (method) => method === "GET" ? { envs: [raw, marker(raw.key)] } : {}, config.projectId,
    { variable: raw.key, action: "replace", label: "Apollo", version: "env_test:1" });
  assert.equal(result.requiresDeployment, false);
});

test("only keys the tab saved are listed or changed; other project variables stay Vercel's", async () => {
  const envs = [raw, { ...raw, id: "cli", key: "MONID_API_KEY", comment: "Monid" }, marker(raw.key, "GONE_API_KEY")];
  const rows = await connectionMetadata(async () => ({ envs }), config.projectId);
  assert.deepEqual(rows.map((row) => [row.variable, row.managed]), [[raw.key, true], ["MONID_API_KEY", false]]);
  const reads = async (method: string) => { assert.equal(method, "GET"); return { envs }; };
  for (const change of [{ action: "replace", version: "cli:1", value: "synthetic" }, { action: "disconnect", version: "cli:1" }, { action: "add", version: "absent", value: "synthetic" }])
    await assert.rejects(changeConnection(reads, config.projectId, { variable: "MONID_API_KEY", ...change }), /use_vercel_settings/);
  // A second marker, or one that is not a plain production-only variable, is not trusted.
  for (const bad of [[marker(), marker()], [{ ...marker(), type: "sensitive" }], [{ ...marker(), target: ["production", "preview"] }]])
    await assert.rejects(connectionMetadata(async () => ({ envs: [raw, ...bad] }), config.projectId), /use_vercel_settings/);
});
test("adding marks the name before the key exists; deleting unmarks it after", async () => {
  let envs: any[] = [];
  const writes: any[] = [];
  const api = async (method: string, path: string, body?: any) => {
    if (method === "GET") return { envs };
    writes.push({ method, path, body: structuredClone(body) });
    if (body?.key === "GTM_CONNECTIONS_MANAGED") envs = [...envs, { ...marker(), value: body.value }];
    else if (method === "PATCH" && path.endsWith("/env_marker")) envs = envs.map((row) => row.id === "env_marker" ? { ...row, value: body.value } : row);
    else if (method === "POST") envs = [...envs, { ...raw, key: body.key, id: "env_new" }];
    else if (method === "DELETE") envs = envs.filter((row) => !path.endsWith(`/${row.id}`));
    return {};
  };
  await changeConnection(api, config.projectId, { variable: "APOLLO_API_KEY", action: "add", label: "Apollo", version: "absent", value: "synthetic" });
  assert.deepEqual(writes.map((write) => [write.method, write.body?.key]), [["POST", "GTM_CONNECTIONS_MANAGED"], ["POST", "APOLLO_API_KEY"]]);
  assert.deepEqual(writes[0].body, { value: '["APOLLO_API_KEY"]', type: "plain", target: ["production"], comment: "Keys saved through Connections", key: "GTM_CONNECTIONS_MANAGED" });
  assert.deepEqual((await connectionMetadata(api, config.projectId)).map((row) => [row.variable, row.managed]), [["APOLLO_API_KEY", true]]);
  writes.length = 0;
  await changeConnection(api, config.projectId, { variable: "APOLLO_API_KEY", action: "disconnect", version: "env_new:1" });
  assert.deepEqual(writes.map((write) => write.method), ["DELETE", "PATCH"]);
  assert.equal(writes[1].body.value, "[]");
});
