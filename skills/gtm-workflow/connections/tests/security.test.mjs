import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { INTEGRATION_SCOPES, validateInstallation, currentMember, envMetadata, vercelStorage } from "../src/vercel.mjs";
import { localAuth } from "../local/auth.mjs";
import { mutation } from "../src/validation.mjs";
import { configuredNames, connectionInventory } from "../dist/catalog.mjs";
const fixed = { teamId: "team_a", projectId: "prj_a", integrationId: "oac_a", installationId: "icfg_a", ownerId: "user_a" };
const grant = { id: fixed.installationId, integrationId: fixed.integrationId, teamId: fixed.teamId, userId: fixed.ownerId, projects: [fixed.projectId], scopes: INTEGRATION_SCOPES };
test("selected installation requires exactly one project and accepts absent projectSelection", () => {
  validateInstallation(grant, fixed); validateInstallation({ ...grant, projectSelection: "selected" }, fixed);
  for (const projects of [undefined, null, [], ["prj_a", "prj_a"], ["prj_a", "prj_b"], ["prj_b"], "prj_a", [null]])
    assert.throws(() => validateInstallation({ ...grant, projects }, fixed));
  for (const projectSelection of ["all", null, false, ""])
    assert.throws(() => validateInstallation({ ...grant, projectSelection }, fixed));
  for (const change of [{ scopes: [...INTEGRATION_SCOPES, "write:deployment"] }, { userId: "other_owner" }, { teamId: "other" }, { integrationId: "other" }, { disabledAt: 1 }, { status: "onboarding" }, { deletedAt: 1 }])
    assert.throws(() => validateInstallation({ ...grant, ...change }, fixed));
});
test("current fully paginated membership controls read and write roles", async () => {
  for (const role of ["OWNER", "MEMBER", "VIEWER", "DEVELOPER", "BILLING", "CONTRIBUTOR", "unknown"]) {
    const calls = [];
    const api = async (method, path) => { calls.push(path); return calls.length === 1 ? { members: [], pagination: { next: 10, hasNext: true } } : { members: [{ uid: "u", confirmed: true, role }], pagination: { next: null, hasNext: false } }; };
    if (["CONTRIBUTOR", "unknown"].includes(role)) await assert.rejects(currentMember(api, "team", "u"));
    else assert.equal((await currentMember(api, "team", "u")).write, ["OWNER", "MEMBER"].includes(role));
    assert.equal(calls.length, 2);
  }
  await assert.rejects(currentMember(async () => ({ members: [{ uid: "u", confirmed: false, role: "OWNER" }], pagination: { next: null } }), "team", "u"));
  await assert.rejects(currentMember(async () => ({ members: [], pagination: { next: 10 } }), "team", "u"));
  await assert.rejects(currentMember(async () => ({ members: [], pagination: {} }), "team", "u"));
});
test("local authority binds peer, host, origin, CSRF, one-use bootstrap and expiry", () => {
  let now = 1000; const origin = "http://127.0.0.1:43567", auth = localAuth(origin, () => now);
  const bootstrap = new URLSearchParams(new URL(auth.opener()).hash.slice(1)).get("bootstrap");
  const session = auth.exchange(bootstrap); assert.throws(() => auth.exchange(bootstrap));
  const make = (headers = {}) => new Request(origin + "/api/connections", { method: "POST", headers: { host: "127.0.0.1:43567", origin, "sec-fetch-site": "same-origin", authorization: `Bearer ${session.bearer}`, "x-gtm-csrf": session.csrf, ...headers } });
  auth.boundary(make(), "127.0.0.1"); assert.equal(auth.authorize(make()).write, true);
  for (const headers of [{ host: "evil.test" }, { origin: "http://127.0.0.1:1" }, { origin: "" }, { "x-forwarded-host": "localhost" }, { "sec-fetch-site": "cross-site" }]) assert.throws(() => auth.boundary(make(headers), "127.0.0.1"));
  assert.throws(() => auth.boundary(make(), "10.0.0.1"));
  assert.throws(() => auth.authorize(make({ "x-gtm-csrf": "wrong" })));
  assert.throws(() => auth.authorize(make({ authorization: "" })));
  now += 900001; assert.throws(() => auth.authorize(make()));
});
test("inventory reports presence and declared gateway usage without credential material", () => {
  const sentinel = "sentinel-provider-DO-NOT-EXPOSE";
  const names = configuredNames({ MONID_API_KEY: sentinel, BLITZ_API_KEY: "  ", CUSTOM_API_KEY: "x", GTM_ADMIN_API_KEY: "secret", NEXT_PUBLIC_BAD_API_KEY: "x", TURSO_AUTH_TOKEN: "x" });
  assert.deepEqual(names, ["CUSTOM_API_KEY", "MONID_API_KEY"]);
  const rows = connectionInventory(names, [{ id: "wf", title: "Enrichment", connections: [{ connection: "monid", provider: "Apollo" }] }], true);
  assert.equal(rows.find((row) => row.id === "monid").usage[0].provider, "Apollo");
  assert.equal(rows.some((row) => row.id === "apollo"), false);
  assert.equal(rows.find((row) => row.id === "ai-gateway").platformIdentity, true);
  assert.equal(JSON.stringify(rows).includes(sentinel), false);
});
test("write validation rejects public, infrastructure and extra credential fields", () => {
  const base = { id: randomUUID(), action: "add", variable: "BLITZ_API_KEY", version: "absent", value: "synthetic" };
  mutation(base);
  for (const variable of ["GTM_TEST_API_KEY", "PUBLIC_TEST_API_KEY", "DATABASE_API_KEY", "VERCEL_API_KEY", "MONID_API_KEY\n", "AUTH_TOKEN"])
    assert.throws(() => mutation({ ...base, variable }));
  assert.throws(() => mutation({ ...base, visibility: "config" }));
});
test("Vercel reads disable decryption and writes retain Secret visibility", async () => {
  const sentinel = "synthetic-do-not-return";
  const raw = { id: "env_a", key: "BLITZ_API_KEY", type: "sensitive", visibility: "secret", target: ["production"], updatedAt: 1, value: sentinel, legacyValue: sentinel, internalContentHint: sentinel, comment: "Existing note" };
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    return method === "GET" ? { envs: [raw] } : { ...raw, ...body, updatedAt: 2 };
  };
  const storage = vercelStorage(api, fixed), rows = await storage.list();
  assert.match(calls[0].path, /decrypt=false/); assert.equal(JSON.stringify(rows).includes(sentinel), false);
  await storage.write({ id: randomUUID(), variable: "BLITZ_API_KEY", action: "replace", value: sentinel, version: rows[0].version }, rows[0]);
  assert.equal(calls[1].body.visibility, "secret"); assert.equal(calls[1].body.type, "sensitive");
  assert.match(calls[1].body.comment, /^Existing note \[gtm-operation:/);
  assert.equal(JSON.stringify(envMetadata(raw)).includes(sentinel), false);
});
