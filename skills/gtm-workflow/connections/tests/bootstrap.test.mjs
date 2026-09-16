import test from "node:test";
import assert from "node:assert/strict";
import { openJournal } from "../src/journal.mjs";
import { installGrant, installStagedGrant, cleanupBootstrap, verifyOwner } from "../setup/bootstrap.mjs";
import { INTEGRATION_SCOPES } from "../src/vercel.mjs";
const fixed = { ownerId: "owner", teamId: "team", projectId: "workflow", adminProjectId: "admin", integrationId: "integration" };
const redirect = "http://localhost:4000/install/nonce";
async function fixture() {
  const journal = await openJournal({ url: ":memory:" }), secrets = new Map([["INTEGRATION_CLIENT_SECRET", "synthetic-client-secret"]]);
  const token = "synthetic-installation-token-never-return", writes = [], envs = [];
  let failure, exchangeCount = 0;
  const store = { loadForRuntime: (key) => secrets.get(key), set: (key, value) => secrets.set(key, value), remove: (key) => secrets.delete(key) };
  const api = async (method, path, body) => {
    if (path === "/v2/user") return { user: { id: "owner" } };
    if (path.includes("/members")) return { members: [{ uid: "owner", confirmed: true, role: "OWNER" }], pagination: { next: null } };
    if (path.includes("/env?")) return { envs };
    if (method === "POST" || method === "PATCH") {
      writes.push({ path, body });
      const old = method === "PATCH" ? envs.find((row) => path.endsWith(`/${row.id}`)) : null;
      const row = { ...body, id: old?.id ?? `env-${envs.length}`, key: old?.key ?? body.key, updatedAt: writes.length };
      delete row.value;
      if (old) envs.splice(envs.indexOf(old), 1, row); else envs.push(row);
      if (failure && (failure === body.key || failure === old?.key)) { failure = null; throw Error("lost response"); }
      return row;
    }
    return { id: path.endsWith("admin") ? "admin" : "workflow", accountId: "team", link: null };
  };
  const fetcher = async (url, options) => {
    if (String(url).includes("access_token")) { exchangeCount++; return Response.json({ access_token: token, installation_id: "installation" }); }
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    return Response.json(String(url).includes("configuration/") ? { id: "installation", integrationId: "integration", teamId: "team", userId: "owner", projects: ["workflow"], scopes: INTEGRATION_SCOPES } : { id: "workflow", accountId: "team" });
  };
  await journal.set("bootstrap", { ...fixed, phase: "callback_pending", expires: Date.now() + 60000, redirect });
  const args = { api, fixed, journal, store, fetcher };
  return { ...args, token, writes, envs, secrets, exchangeCount: () => exchangeCount, fail: (key) => { failure = key; }, start: () => installGrant({ ...args, code: "synthetic-code", redirect }) };
}
test("installation uses owner writes; retries preserve saved credentials and reject external changes", async () => {
  const f = await fixture();
  try {
    const result = await f.start();
    assert.equal(result.status, "admin_configured");
    assert.equal(f.writes.length, 3); assert.ok(f.writes.every((write) => write.path === "/v10/projects/admin/env"));
    assert.equal(f.writes[0].body.value, f.token); assert.equal(f.writes[0].body.visibility, "secret");
    for (const value of [result, await f.journal.get("bootstrap"), await f.journal.get("configuration:admin:CONNECTIONS_INTEGRATION_TOKEN")]) assert.equal(JSON.stringify(value).includes(f.token), false);
    await installStagedGrant(f);
    assert.equal(f.writes.length, 3); assert.equal(f.exchangeCount(), 1);
    await assert.rejects(verifyOwner(async () => ({ user: { id: "different-owner" } }), fixed), /cli_owner_changed/);
    f.envs[0].updatedAt++;
    await assert.rejects(installStagedGrant(f), /setup_configuration_changed/);
    assert.equal(f.writes.length, 3);
  } finally { f.journal.close(); }
});
test("lost admin write pauses until explicit reapply, without exchanging the code again", async () => {
  const f = await fixture();
  try {
    f.fail("CONNECTIONS_INTEGRATION_TOKEN");
    await assert.rejects(f.start(), /lost response/);
    assert.equal((await f.journal.get("bootstrap")).phase, "admin_write_attempted");
    await assert.rejects(installStagedGrant(f), /setup_configuration_unresolved/);
    assert.equal(f.writes.length, 1);
    await installStagedGrant({ ...f, reapply: true });
    assert.equal(f.writes.length, 4); assert.equal(f.writes[1].path, "/v9/projects/admin/env/env-0");
    assert.equal(f.exchangeCount(), 1);
    await installStagedGrant(f); assert.equal(f.writes.length, 4);
  } finally { f.journal.close(); }
});
test("partial setup resumes unfinished fields; targets, expiry and existing values fail closed", async () => {
  const f = await fixture();
  try {
    f.fail("CONNECTIONS_INSTALLATION_ID");
    await assert.rejects(f.start(), /lost response/);
    await assert.rejects(installStagedGrant(f), /setup_configuration_unresolved/);
    await installStagedGrant({ ...f, reapply: true });
    assert.equal(f.writes.filter((write) => write.body.key === "CONNECTIONS_INTEGRATION_TOKEN").length, 1);
    await f.journal.set("bootstrap", { ...await f.journal.get("bootstrap"), adminProjectId: "substituted" });
    await assert.rejects(installStagedGrant(f), /installation_binding_changed/);
    await f.journal.set("bootstrap", { ...await f.journal.get("bootstrap"), adminProjectId: "admin", expires: 0 });
    await assert.rejects(installStagedGrant(f), /installation_transaction_expired/);
    assert.deepEqual(await cleanupBootstrap(f), { status: "bootstrap_expired", installationId: "installation", revocationRequired: true });
    assert.equal(f.secrets.size, 0);
  } finally { f.journal.close(); }
  const g = await fixture();
  try {
    g.envs.push({ id: "preexisting", key: "CONNECTIONS_INTEGRATION_TOKEN", target: ["production"], visibility: "secret", updatedAt: 1 });
    await assert.rejects(g.start(), /existing_configuration_requires_reconciliation/);
    assert.equal(g.writes.length, 0);
  } finally { g.journal.close(); }
});
test("wrong callback cannot consume an exchange; native staging recovers a crash after exchange", async () => {
  const f = await fixture();
  try {
    await assert.rejects(installGrant({ ...f, code: "unused", redirect: "http://localhost:4001/install/nonce" }), /installation_callback_denied/);
    assert.equal(f.exchangeCount(), 0);
    await f.journal.set("bootstrap", { ...await f.journal.get("bootstrap"), phase: "exchange_started", installationId: "installation" });
    await assert.rejects(installStagedGrant(f), /staged_grant_missing/);
    f.store.set("INTEGRATION_TOKEN", f.token);
    await installStagedGrant(f);
    assert.equal(f.exchangeCount(), 0); assert.equal(f.writes.length, 3);
  } finally { f.journal.close(); }
});

test("installation HTTP callback requires the exact host, nonce, initiated cookie and one-use code", async () => {
  const { installationListener } = await import("../setup/bootstrap.mjs");
  const f = await fixture(); let receipt;
  const listener = await installationListener({ ...f, fixed: { ...fixed, integrationSlug: "synthetic" }, onInstalled: (result) => { receipt = result; } });
  const target = new URL(listener.redirect), transport = `http://127.0.0.1:${target.port}`;
  const { request } = await import("node:http");
  const get = (path, headers = {}) => new Promise((resolve, reject) => {
    request(transport + path, { headers: { host: target.host, ...headers } }, (incoming) => {
      const chunks = []; incoming.on("data", (chunk) => chunks.push(chunk));
      incoming.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
    }).on("error", reject).end();
  });
  try {
    assert.equal((await get(target.pathname, { host: "other.local" })).status, 403);
    assert.equal((await get(target.pathname, { "x-forwarded-for": "127.0.0.1" })).status, 403);
    assert.equal((await get("/install/wrong?code=unused")).status, 403);
    assert.equal((await get(`${target.pathname}?code=unused`)).status, 403);
    assert.equal(f.exchangeCount(), 0);
    const begin = await get(target.pathname);
    assert.equal(begin.status, 302); assert.equal(begin.headers.get("location"), "https://vercel.com/integrations/synthetic/new");
    const cookie = begin.headers.get("set-cookie").split(";")[0];
    assert.match(begin.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
    assert.equal((await get(`${target.pathname}?code=unused`, { cookie: "gtm_install=forged" })).status, 403);
    assert.equal((await get(`${target.pathname}?code=one&code=two`, { cookie })).status, 403);
    const saved = await get(`${target.pathname}?code=synthetic-code`, { cookie });
    assert.equal(saved.status, 200); assert.equal((await saved.text()).includes(f.token), false);
    assert.equal(receipt.status, "admin_configured");
    assert.equal((await get(`${target.pathname}?code=synthetic-code`, { cookie })).status, 403);
    assert.equal(f.exchangeCount(), 1);
  } finally { await listener.close(); f.journal.close(); }
});
