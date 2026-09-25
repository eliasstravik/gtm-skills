import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLocalConnections, localConnectionsPage, forwardLocalConnections } from "../templates/lib/connections-local";
import { privateAccess, requireMutation } from "../templates/lib/viewer-access";

const token = "a".repeat(64), link = "http://127.0.0.1:45678/#bootstrap=synthetic-one-use";
const click = (headers: Record<string, string> = {}, url = "http://127.0.0.1:3939/connections") => new Request(url, {
  headers: { host: new URL(url).host, "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...headers } });
async function manager(work: (path: string, calls: string[]) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "gtm-connections-local-")), socket = join(dir, "m-test.sock"), path = join(dir, "manager.json"), calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.url} ${req.headers.authorization}`);
    if (req.headers.authorization === `Bearer ${token}` && req.url?.startsWith("/proxy/api/")) {
      let body = ""; req.on("data", (chunk) => body += chunk);
      return req.on("end", () => { res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ path: req.url, method: req.method, session: req.headers["x-gtm-session"] ?? null, csrf: req.headers["x-gtm-csrf"] ?? null, body })); });
    }
    if (req.headers.authorization !== `Bearer ${token}` || req.url !== "/open") { res.writeHead(401); return res.end(); }
    res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ url: link }));
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  await writeFile(path, JSON.stringify({ pid: process.pid, origin: "http://127.0.0.1:45678", ipcPath: socket, ipcToken: token }), { mode: 0o600 });
  const previous = { ...process.env };
  process.env.GTM_CONNECTIONS_MANAGER = path; delete process.env.VERCEL; delete process.env.GTM_VIEWER_MODE;
  try { await work(path, calls); } finally {
    process.env = previous;
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
}
test("the viewer's Connections tab lands signed in through a fresh one-use link", { skip: process.platform === "win32" }, () => manager(async (_path, calls) => {
  for (const site of ["same-origin", "none"]) {
    const response = await openLocalConnections(click({ "sec-fetch-site": site }));
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), link);
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  }
  assert.deepEqual(calls, [`/open Bearer ${token}`, `/open Bearer ${token}`]);
}));
test("another site, a script or a rebound host cannot mint a sign-in link", { skip: process.platform === "win32" }, () => manager(async (_path, calls) => {
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-mode": "cors" }, { "sec-fetch-dest": "empty" },
    { "sec-fetch-site": "" }, { host: "evil.test:3939" }, { origin: "https://evil.test" }]) {
    const response = await openLocalConnections(click(headers));
    assert.equal(response.status, 403, JSON.stringify(headers)); assert.equal(response.headers.get("location"), null);
  }
  assert.equal((await openLocalConnections(click({}, "http://evil.test:3939/connections"))).status, 403);
  assert.deepEqual(calls, []);
}));
test("a dead, unsafe or missing manager fails closed with a restart hint", { skip: process.platform === "win32" }, () => manager(async (path, calls) => {
  await chmod(path, 0o644);
  assert.equal((await openLocalConnections(click())).status, 503);
  await chmod(path, 0o600);
  await writeFile(path, JSON.stringify({ pid: 2 ** 22 + 7, ipcPath: join(path, "../m-test.sock"), ipcToken: token }), { mode: 0o600 });
  const dead = await openLocalConnections(click());
  assert.equal(dead.status, 503); assert.match(await dead.text(), /npm run viewer/);
  await writeFile(path, JSON.stringify({ pid: process.pid, ipcPath: "/tmp/elsewhere.sock", ipcToken: token }), { mode: 0o600 });
  assert.equal((await openLocalConnections(click())).status, 503);
  await rm(path); await symlink("/etc/hosts", path);
  assert.equal((await openLocalConnections(click())).status, 503);
  assert.deepEqual(calls, []);
  delete process.env.GTM_CONNECTIONS_MANAGER;
  assert.equal((await openLocalConnections(click())).status, 404);
}));

// Tailnet mode: Tailscale Serve proxies the tailnet address straight to the viewer, sets Host to that address, adds
// X-Forwarded-For, and replaces any identity header a client sent with the caller's own login.
const tailnetOrigin = "https://owner-mac.tail0000.ts.net:55591", owner = "owner@example.com";
const serve = (login: string | null, headers: Record<string, string> = {}, path = "/connections") => new Request(`http://owner-mac.tail0000.ts.net:55591${path}`, {
  method: headers.method ?? "GET", headers: { host: "owner-mac.tail0000.ts.net:55591", "x-forwarded-for": "100.64.0.2", ...(login ? { "tailscale-user-login": login } : {}),
    "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "method" && name !== "body")) },
  ...(headers.body ? { body: headers.body } : {}) });
const tailnet = (work: (calls: string[]) => Promise<void>) => manager(async (_path, calls) => {
  process.env.GTM_VIEWER_TAILNET_OWNER = "Owner@Example.com"; process.env.GTM_VIEWER_TAILNET_ORIGIN = tailnetOrigin;
  await work(calls);
});
const status = (request: Request) => privateAccess(request).then(() => 200, (error) => error.status as number);
test("tailnet mode admits only the owner's Tailscale login, through Serve, never Funnel", { skip: process.platform === "win32" }, () => tailnet(async (calls) => {
  const signIn = await openLocalConnections(serve(owner));
  assert.equal(signIn.status, 303); assert.equal(signIn.headers.get("location"), "/connections/manage#bootstrap=synthetic-one-use");
  assert.equal(await status(serve(owner)), 200);
  assert.equal(await status(click()), 200, "the owner at the computer itself still gets in");
  for (const [label, request] of [
    ["another tailnet login", serve("someone@example.com")],
    ["no login (a tagged device)", serve(null)],
    ["a foreign Origin", serve(owner, { origin: "https://evil.test" })],
    ["the loopback Origin", serve(owner, { origin: "http://127.0.0.1:3939" })],
    ["Funnel", serve(owner, { "tailscale-funnel-request": "?1" })],
    ["a Host-rewriting relay", serve(owner, { host: "127.0.0.1:3939" })],
    ["another host", serve(owner, { host: "evil.test" })],
  ] as const) {
    assert.equal(await status(request), 403, label);
    assert.equal((await openLocalConnections(request)).status, 403, label);
  }
  assert.deepEqual(calls, [`/open Bearer ${token}`], "only the owner's click minted a link");
  process.env.GTM_VIEWER_TAILNET_ORIGIN = "http://owner-mac.tail0000.ts.net";
  assert.equal(await status(click()), 503, "half a setting fails closed");
  delete process.env.GTM_VIEWER_TAILNET_OWNER; delete process.env.GTM_VIEWER_TAILNET_ORIGIN;
  assert.equal(await status(serve(owner)), 403, "off by default: the tailnet address is refused");
}));
test("sharing changes from the tailnet page pass the CSRF check with the tailnet origin only", { skip: process.platform === "win32" }, () => tailnet(async () => {
  const csrf = "c".repeat(43), change = (origin: string) => serve(owner, { method: "POST", origin, cookie: `gtm_viewer_csrf=${csrf}`, "x-gtm-csrf": csrf,
    "content-type": "application/json", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", body: "{}" }, "/api/viewer");
  await requireMutation(change(tailnetOrigin));
  await assert.rejects(requireMutation(change("http://owner-mac.tail0000.ts.net:55591")), { code: "origin_denied" });
}));
test("the tailnet Connections page forwards its calls over the owner-only socket and nothing else", { skip: process.platform === "win32" }, () => tailnet(async (calls) => {
  const page = await localConnectionsPage(serve(owner, {}, "/connections/manage"));
  assert.equal(page.status, 200); assert.match(await page.text(), /data-tailnet="true"/);
  assert.equal((await localConnectionsPage(serve("someone@example.com", {}, "/connections/manage"))).status, 403);
  const api = (login: string | null, headers: Record<string, string>) => serve(login, { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", authorization: "Bearer session-1", ...headers }, "/api/connection-management/x");
  const read = await forwardLocalConnections(api(owner, {}), "session");
  assert.deepEqual(await read.json(), { path: "/proxy/api/session", method: "GET", session: "session-1", csrf: null, body: "" });
  const write = await forwardLocalConnections(api(owner, { method: "POST", origin: tailnetOrigin, "x-gtm-csrf": "k", "content-type": "application/json", body: '{"a":1}' }), "connections");
  assert.deepEqual(await write.json(), { path: "/proxy/api/connections", method: "POST", session: "session-1", csrf: "k", body: '{"a":1}' });
  const before = calls.length;
  for (const [label, request, path] of [
    ["another login", api("someone@example.com", {}), "session"],
    ["a missing login", api(null, {}), "session"],
    ["another site", api(owner, { "sec-fetch-site": "cross-site" }), "session"],
    ["a change without Origin", api(owner, { method: "POST", body: "{}" }), "connections"],
    ["a change from a foreign Origin", api(owner, { method: "POST", origin: "https://evil.test", body: "{}" }), "connections"],
    ["an unknown path", api(owner, {}), "../open"],
  ] as const) assert.ok([403, 404].includes((await forwardLocalConnections(request, path)).status), label);
  assert.equal(calls.length, before, "nothing refused reached the manager");
  delete process.env.GTM_VIEWER_TAILNET_OWNER; delete process.env.GTM_VIEWER_TAILNET_ORIGIN;
  assert.equal((await forwardLocalConnections(api(owner, {}), "session")).status, 404, "no forwarding outside tailnet mode");
  assert.equal((await localConnectionsPage(click({}, "http://127.0.0.1:3939/connections/manage"))).status, 404);
}));
