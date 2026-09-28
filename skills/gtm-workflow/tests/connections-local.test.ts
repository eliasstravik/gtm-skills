// The local Keys page and local route access: `.env.local` is the store, only this computer or the owner's tailnet
// login gets in, and nothing on another web site can change keys or start runs.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editEnv, localKeyNames, savedKeyNames } from "../templates/lib/connections-local";
import { connectionsManagement } from "../templates/lib/connections-management";
import { apiAccess } from "../templates/lib/route-access";
import { privateAccess, requireMutation } from "../templates/lib/viewer-access";

async function inFolder(work: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "gtm-keys-")), cwd = process.cwd(), previous = { ...process.env };
  process.chdir(dir); delete process.env.VERCEL; delete process.env.GTM_VIEWER_MODE;
  try { await work(dir); } finally { process.chdir(cwd); process.env = previous; await rm(dir, { recursive: true, force: true }); }
}
const origin = "http://127.0.0.1:3939";
const page = (method = "GET", headers: Record<string, string> = {}, body?: unknown, url = `${origin}/api/connection-management`) => new Request(url, {
  method, headers: { host: new URL(url).host, ...(method === "POST" ? { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" } : {}), ...headers },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

test("editing .env.local keeps comments and other lines and reads back exactly", () => {
  const before = "# my settings\nGTM_MODEL=openai/x\nAPOLLO_API_KEY=old\n\nexport APOLLO_API_KEY=dup\nOTHER=1\n";
  const replaced = editEnv(before, "APOLLO_API_KEY", "new'value");
  assert.equal(replaced, "# my settings\nGTM_MODEL=openai/x\nAPOLLO_API_KEY=\"new'value\"\n\nOTHER=1\n");
  const added = editEnv("# only a comment", "BLITZ_API_KEY", "b#c d");
  assert.equal(added, "# only a comment\nBLITZ_API_KEY='b#c d'\n");
  assert.equal(editEnv(replaced, "APOLLO_API_KEY", null), "# my settings\nGTM_MODEL=openai/x\n\nOTHER=1\n");
  assert.throws(() => editEnv("", "GTM_RUN_SECRET", "x"), { code: "invalid_provider_variable" });
  assert.throws(() => editEnv("", "A_API_KEY", "a'b\"c`d"), { code: "invalid_key" });
});

test("unlinked: the Keys page saves to .env.local, owner-only, and lists names, never values", () => inFolder(async (dir) => {
  await writeFile(join(dir, ".env.local"), "# keep me\nGTM_VIEWER_TAILNET_OWNER=me@example.com\n");
  const saved = await connectionsManagement(page("POST", {}, { action: "add", variable: "APOLLO_API_KEY", value: "sk-1" }), []);
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), { saved: true, store: "file", restartRequired: true });
  const text = await readFile(join(dir, ".env.local"), "utf8");
  assert.equal(text, "# keep me\nGTM_VIEWER_TAILNET_OWNER=me@example.com\nAPOLLO_API_KEY='sk-1'\n");
  if (process.platform !== "win32") assert.equal((await stat(join(dir, ".env.local"))).mode & 0o777, 0o600);
  const list = await (await connectionsManagement(page(), [])).json();
  assert.equal(list.mode, "local"); assert.equal(list.linked, false);
  assert.deepEqual(list.connections.map((row: { id: string }) => row.id), ["APOLLO_API_KEY"]);
  assert.ok(!JSON.stringify(list).includes("sk-1"));
  assert.deepEqual(savedKeyNames(), ["APOLLO_API_KEY"]);
  // The running server's keys: only names it loaded.
  assert.deepEqual(localKeyNames({ APOLLO_API_KEY: "sk-1" }), ["APOLLO_API_KEY"]);
  assert.deepEqual(localKeyNames({}), []);
  await connectionsManagement(page("POST", {}, { action: "disconnect", variable: "APOLLO_API_KEY" }), []);
  assert.equal(await readFile(join(dir, ".env.local"), "utf8"), "# keep me\nGTM_VIEWER_TAILNET_OWNER=me@example.com\n");
}));

test("linked: the Keys page still writes .env.local only and never runs the Vercel CLI", () => inFolder(async (dir) => {
  await mkdir(join(dir, ".vercel")); await writeFile(join(dir, ".vercel", "project.json"), "{}");
  // A `vercel` on PATH that would leave a trace if the page ever ran it.
  await mkdir(join(dir, "bin")); await writeFile(join(dir, "bin", "vercel"), `#!/bin/sh\ntouch ${join(dir, "ran")}\n`, { mode: 0o755 });
  process.env.PATH = `${join(dir, "bin")}:${process.env.PATH}`;
  const saved = await connectionsManagement(page("POST", {}, { action: "add", variable: "APOLLO_API_KEY", value: "sk-1" }), []);
  assert.deepEqual(await saved.json(), { saved: true, store: "file", restartRequired: true });
  assert.equal(await readFile(join(dir, ".env.local"), "utf8"), "APOLLO_API_KEY='sk-1'\n");
  assert.equal((await (await connectionsManagement(page(), [])).json()).linked, true);
  await assert.rejects(stat(join(dir, "ran")));
}));

test("another site, another host or a script without the page's origin cannot change keys", () => inFolder(async (dir) => {
  const add = { action: "add", variable: "APOLLO_API_KEY", value: "sk-1" };
  for (const [label, request] of [
    ["a cross-site page", page("POST", { "sec-fetch-site": "cross-site", origin: "https://evil.test" }, add)],
    ["a foreign Origin", page("POST", { origin: "https://evil.test" }, add)],
    ["no Origin", new Request(`${origin}/api/connection-management`, { method: "POST", headers: { host: "127.0.0.1:3939", "content-type": "application/json" }, body: JSON.stringify(add) })],
    ["a form post", page("POST", { "content-type": "text/plain" }, add)],
    ["a rebound host", page("POST", { host: "evil.test:3939" }, add, "http://evil.test:3939/api/connection-management")],
  ] as const) assert.equal((await connectionsManagement(request, [])).status, 403, label);
  await assert.rejects(readFile(join(dir, ".env.local")), { code: "ENOENT" });
}));

test("local API routes: this computer only; a change never from another site; GETs never change anything", async () => {
  const previous = process.env.VERCEL; delete process.env.VERCEL;
  try {
    const call = (method: string, headers: Record<string, string> = {}, url = `${origin}/api/run/x`) => apiAccess(new Request(url, { method, headers: { host: new URL(url).host, ...headers } }));
    assert.equal(await call("POST"), true, "curl");
    assert.equal(await call("POST", { "sec-fetch-site": "same-origin", origin }), true, "the viewer's own page");
    assert.equal(await call("POST", { "sec-fetch-site": "none" }), true, "typed into the address bar");
    assert.equal(await call("POST", { "sec-fetch-site": "cross-site" }), false, "a page on another site");
    assert.equal(await call("POST", { "sec-fetch-site": "same-site" }), false, "a sibling site");
    assert.equal(await call("POST", { origin: "https://evil.test" }), false, "a foreign Origin");
    assert.equal(await call("GET", {}, "http://evil.test:3939/api/runs/x"), false, "a rebound host");
    assert.equal(await call("GET", { "sec-fetch-site": "cross-site" }, `${origin}/api/runs/x`), true, "reads are harmless");
  } finally { if (previous !== undefined) process.env.VERCEL = previous; }
});

test("locally a GET on the run route never starts a run", async () => {
  const previous = process.env.VERCEL; delete process.env.VERCEL;
  try {
    const route = (await import("../templates/server/api/run/[slug]")).default as unknown as (event: unknown) => Promise<Response>;
    const response = await route({ req: new Request(`${origin}/api/run/x`, { headers: { host: "127.0.0.1:3939" } }), context: { params: { slug: "x" } } });
    assert.equal(response.status, 405);
  } finally { if (previous !== undefined) process.env.VERCEL = previous; }
});

// Tailnet mode: Tailscale Serve proxies the tailnet address straight to the viewer, sets Host to that address, adds
// X-Forwarded-For, and replaces any identity header a client sent with the caller's own login.
const tailnetOrigin = "https://owner-mac.tail0000.ts.net:55591", owner = "owner@example.com";
const serve = (login: string | null, headers: Record<string, string> = {}, path = "/connections") => new Request(`http://owner-mac.tail0000.ts.net:55591${path}`, {
  method: headers.method ?? "GET", headers: { host: "owner-mac.tail0000.ts.net:55591", "x-forwarded-for": "100.64.0.2", ...(login ? { "tailscale-user-login": login } : {}),
    "sec-fetch-site": "same-origin", ...Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "method" && name !== "body")) },
  ...(headers.body ? { body: headers.body } : {}) });
const tailnet = (work: (dir: string) => Promise<void>) => inFolder(async (dir) => {
  process.env.GTM_VIEWER_TAILNET_OWNER = "Owner@Example.com"; process.env.GTM_VIEWER_TAILNET_ORIGIN = tailnetOrigin;
  await work(dir);
});
const status = (request: Request) => privateAccess(request).then(() => 200, (error) => error.status as number);
test("tailnet mode admits only the owner's Tailscale login, through Serve, never Funnel", () => tailnet(async () => {
  assert.equal(await status(serve(owner)), 200);
  assert.equal(await status(new Request(`${origin}/connections`, { headers: { host: "127.0.0.1:3939" } })), 200, "the owner at the computer itself still gets in");
  for (const [label, request] of [
    ["another tailnet login", serve("someone@example.com")],
    ["no login (a tagged device)", serve(null)],
    ["a foreign Origin", serve(owner, { origin: "https://evil.test" })],
    ["the loopback Origin", serve(owner, { origin: "http://127.0.0.1:3939" })],
    ["Funnel", serve(owner, { "tailscale-funnel-request": "?1" })],
    ["a Host-rewriting relay", serve(owner, { host: "127.0.0.1:3939" })],
    ["another host", serve(owner, { host: "evil.test" })],
  ] as const) assert.equal(await status(request), 403, label);
  process.env.GTM_VIEWER_TAILNET_ORIGIN = "http://owner-mac.tail0000.ts.net";
  assert.equal(await status(new Request(`${origin}/connections`, { headers: { host: "127.0.0.1:3939" } })), 503, "half a setting fails closed");
  delete process.env.GTM_VIEWER_TAILNET_OWNER; delete process.env.GTM_VIEWER_TAILNET_ORIGIN;
  assert.equal(await status(serve(owner)), 403, "off by default: the tailnet address is refused");
}));
test("the Keys page works from the tailnet for the owner, with the tailnet origin only", () => tailnet(async (dir) => {
  const change = (login: string | null, from: string) => serve(login, { method: "POST", origin: from, "content-type": "application/json",
    body: JSON.stringify({ action: "add", variable: "APOLLO_API_KEY", value: "sk-2" }) }, "/api/connection-management");
  assert.equal((await connectionsManagement(change("someone@example.com", tailnetOrigin), [])).status, 403);
  assert.equal((await connectionsManagement(change(owner, "http://127.0.0.1:3939"), [])).status, 403);
  assert.equal((await connectionsManagement(change(owner, tailnetOrigin), [])).status, 200);
  assert.match(await readFile(join(dir, ".env.local"), "utf8"), /^APOLLO_API_KEY='sk-2'$/m);
  const page = (await import("../templates/server/routes/connections.get")).default as unknown as (event: unknown) => Promise<Response>;
  const html = await page({ req: serve(owner) });
  assert.equal(html.status, 200); assert.match(await html.text(), /data-environment="local"/);
  assert.equal((await page({ req: serve("someone@example.com") })).status, 403);
}));
test("sharing changes from the tailnet page pass the CSRF check with the tailnet origin only", () => tailnet(async () => {
  const csrf = "c".repeat(43), change = (from: string) => serve(owner, { method: "POST", origin: from, cookie: `gtm_viewer_csrf=${csrf}`, "x-gtm-csrf": csrf,
    "content-type": "application/json", body: "{}" }, "/api/viewer");
  await requireMutation(change(tailnetOrigin));
  await assert.rejects(requireMutation(change("http://owner-mac.tail0000.ts.net:55591")), { code: "origin_denied" });
}));

test("production routes: past Vercel Authentication, never the share relay; agent routes want the bypass, cron its secret", async () => {
  const previous = { ...process.env };
  Object.assign(process.env, { VERCEL: "1", GTM_VIEWER_PROTECTED: "1", VERCEL_AUTOMATION_BYPASS_SECRET: "bypass-1", CRON_SECRET: "cron-1" });
  try {
    const call = (headers: Record<string, string> = {}, options = {}) => apiAccess(new Request("https://gtm-acme.vercel.app/api/run/x", { method: "POST", headers }), options);
    assert.equal(await call(), true, "a teammate through vercel curl or the browser");
    assert.equal(await call({ "x-vercel-trusted-oidc-idp-token": "relay" }), false, "the share relay's identity");
    assert.equal(await call({ "x-vercel-trusted-oidc-idp-token": "relay", "x-vercel-protection-bypass": "bypass-1" }, { agent: true }), false);
    assert.equal(await call({}, { agent: true }), false, "share links and key names need the bypass");
    assert.equal(await call({ "x-vercel-protection-bypass": "bypass-2" }, { agent: true }), false);
    assert.equal(await call({ "x-vercel-protection-bypass": "bypass-1" }, { agent: true }), true);
    assert.equal(await call({}, { cron: true }), false, "a GET without CRON_SECRET starts nothing");
    assert.equal(await call({ authorization: "Bearer cron-2" }, { cron: true }), false);
    assert.equal(await call({ authorization: "Bearer cron-1" }, { cron: true }), true);
    process.env.GTM_VIEWER_PROTECTED = "0";
    assert.equal(await call(), false, "nothing is open before protection is verified");
  } finally { process.env = previous; }
});

test("the Keys page lists the keys workflows use but nobody saved, with the workflows that need them", () => inFolder(async (dir) => {
  const workflows = [
    { id: "w1", title: "Score", connections: [{ connection: "APOLLO_API_KEY", provider: "Apollo" }, { connection: "hunter" }] },
    { id: "w2", title: "Research", connections: [{ connection: "APOLLO_API_KEY" }, { connection: "ai-gateway" }] },
    { id: "w3", title: "Undeclared" },
  ];
  delete process.env.AI_GATEWAY_API_KEY; delete process.env.VERCEL_OIDC_TOKEN; delete process.env.HUNTER_API_KEY;
  const list = await (await connectionsManagement(page(), workflows)).json();
  assert.deepEqual(list.missing, [
    { variable: "AI_GATEWAY_API_KEY", workflows: [{ id: "w2", title: "Research" }] },
    { variable: "APOLLO_API_KEY", provider: "Apollo", workflows: [{ id: "w1", title: "Score" }, { id: "w2", title: "Research" }] },
    { variable: "HUNTER_API_KEY", workflows: [{ id: "w1", title: "Score" }] },
  ]);
  // Saved in .env.local, or `vercel env pull` left Vercel's identity for the Gateway: no longer missing.
  await writeFile(join(dir, ".env.local"), "APOLLO_API_KEY='sk-secret'\n");
  process.env.VERCEL_OIDC_TOKEN = "oidc-secret";
  const after = await (await connectionsManagement(page(), workflows)).json();
  assert.deepEqual(after.missing.map((row: { variable: string }) => row.variable), ["HUNTER_API_KEY"]);
  assert.deepEqual(after.connections[0].usage.map((use: { workflowId: string }) => use.workflowId), ["w1", "w2"]);
  assert.ok(!/sk-secret|oidc-secret/.test(JSON.stringify(after)));
}));
