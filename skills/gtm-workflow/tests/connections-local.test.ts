import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile, chmod, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLocalConnections } from "../templates/lib/connections-local";

const token = "a".repeat(64), link = "http://127.0.0.1:45678/#bootstrap=synthetic-one-use";
const click = (headers: Record<string, string> = {}, url = "http://127.0.0.1:3939/connections") => new Request(url, {
  headers: { host: new URL(url).host, "sec-fetch-site": "same-origin", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", ...headers } });
async function manager(work: (path: string, calls: string[]) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "gtm-connections-local-")), socket = join(dir, "m-test.sock"), path = join(dir, "manager.json"), calls: string[] = [];
  const server = createServer((req, res) => {
    calls.push(`${req.url} ${req.headers.authorization}`);
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
