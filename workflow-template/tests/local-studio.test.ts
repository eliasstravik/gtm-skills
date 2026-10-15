// Open database in tailnet mode: Studio is shared on the tailnet on a free HTTPS port, behind a gate that admits only
// the owner's Tailscale login, and the run inspector admits only whom the viewer admits.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shareStudio, studioGate } from "../templates/lib/local-studio";
import { removeStudioShare } from "../templates/scripts/studio-share.mjs";
import inspectorAccess from "../templates/server/middleware/inspector-access";

const listen = (server: Server) => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const owner = "owner@example.com", host = "owner-mac.tail0000.ts.net";

test("the Studio gate relays only the owner's Tailscale login, never Funnel", async () => {
  const studio = createServer((req, res) => res.end(`studio ${req.method} ${req.url}`));
  const gate = await studioGate(await listen(studio), "Owner@Example.com");
  const url = `http://127.0.0.1:${(gate.address() as AddressInfo).port}/?x=1`;
  try {
    const ok = await fetch(url, { method: "POST", body: "{}", headers: { "tailscale-user-login": owner } });
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "studio POST /?x=1");
    for (const [label, headers] of [
      ["no login", {}],
      ["another login", { "tailscale-user-login": "someone@example.com" }],
      ["Funnel", { "tailscale-user-login": owner, "tailscale-funnel-request": "?1" }],
    ] as const) assert.equal((await fetch(url, { headers })).status, 403, label);
  } finally { gate.close(); studio.close(); }
});

test("the tailnet share takes a free HTTPS port, never replaces a share, and never outlives the dev server", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-studio-"));
  await mkdir(join(dir, "node_modules"));
  const calls: string[][] = [];
  const shares: Record<string, string> = { [`${host}:443`]: "http://127.0.0.1:3939", [`${host}:8443`]: "http://127.0.0.1:9999" };
  const funnel: Record<string, boolean> = {};
  const tailscaleSync = (args: string[]) => {
    calls.push(args);
    if (args[1] === "status") return JSON.stringify({
      TCP: Object.fromEntries(Object.keys(shares).map((key) => [key.split(":")[1], { HTTPS: true }])),
      Web: Object.fromEntries(Object.entries(shares).map(([key, proxy]) => [key, { Handlers: { "/": { Proxy: proxy } } }])),
      AllowFunnel: funnel,
    });
    const port = args.find((arg) => arg.startsWith("--https="))!.slice(8);
    if (args.at(-1) === "off") delete shares[`${host}:${port}`];
    else shares[`${host}:${port}`] = args.at(-1)!;
    return "";
  };
  const tailscale = async (args: string[]) => tailscaleSync(args);
  try {
    const url = await shareStudio(4983, { owner, host: `${host}:55591` }, dir, tailscale, tailscaleSync);
    assert.equal(url, `https://local.drizzle.studio/?host=${host}&port=8444`);
    const serve = calls.find((args) => args.includes("--bg"))!;
    assert.deepEqual(serve.slice(0, 3), ["serve", "--bg", "--https=8444"]);
    assert.match(serve[3], /^http:\/\/127\.0\.0\.1:\d+$/, "Serve points at the loopback gate, not at Studio");
    assert.equal(shares[`${host}:8443`], "http://127.0.0.1:9999", "the existing share is untouched");
    assert.ok(!calls.some((args) => args.includes("funnel")));

    // Someone reused the port for their own share: stopping leaves it alone.
    const recorded = await readFile(join(dir, "node_modules/.gtm-studio-share.json"), "utf8");
    shares[`${host}:8444`] = "http://127.0.0.1:7000";
    removeStudioShare(dir, tailscaleSync);
    assert.equal(shares[`${host}:8444`], "http://127.0.0.1:7000");
    // Stopping `npm run dev` (or the next share, after a crash) removes this dev server's own share.
    await writeFile(join(dir, "node_modules/.gtm-studio-share.json"), recorded);
    shares[`${host}:8444`] = serve[3];
    removeStudioShare(dir, tailscaleSync);
    assert.equal(shares[`${host}:8444`], undefined);
    await assert.rejects(readFile(join(dir, "node_modules/.gtm-studio-share.json")));

    // A share Serve reports as public is taken down again and refused.
    delete shares[`${host}:8444`];
    funnel[`${host}:8444`] = true;
    await assert.rejects(shareStudio(4983, { owner, host }, dir, tailscale, tailscaleSync), /never public/);
    assert.equal(shares[`${host}:8444`], undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the run inspector admits whom the viewer admits; the tailnet never reaches the run endpoints", async () => {
  const previous = { ...process.env };
  delete process.env.VERCEL;
  Object.assign(process.env, { GTM_VIEWER_TAILNET_OWNER: owner, GTM_VIEWER_TAILNET_ORIGIN: `https://${host}` });
  const call = async (url: string, headers: Record<string, string> = {}) => {
    const req = new Request(url, { headers: { host: new URL(url).host, ...headers } });
    const answer = await (inspectorAccess as unknown as (event: unknown) => Promise<Response | undefined>)({ req, url: new URL(url) });
    return answer?.status ?? "next";
  };
  const serve = (login: string) => ({ "x-forwarded-for": "100.64.0.2", "tailscale-user-login": login });
  try {
    assert.equal(await call("http://127.0.0.1:3939/_workflow/run/x"), "next");
    assert.equal(await call(`http://${host}/_workflow`, serve(owner)), "next");
    assert.equal(await call(`http://${host}/assets/font.woff2`, serve(owner)), "next");
    assert.equal(await call(`http://${host}/_workflow/run/x`, serve("someone@example.com")), 403);
    assert.equal(await call(`http://${host}/assets/font.woff2`, serve("someone@example.com")), 403);
    assert.equal(await call("http://127.0.0.1:3939/.well-known/workflow/v1/flow"), "next", "this server's own queue");
    assert.equal(await call(`http://${host}/.well-known/workflow/v1/flow`, serve(owner)), 404);
    assert.equal(await call(`http://${host}/api/viewer`, serve("someone@example.com")), "next", "other routes check access themselves");
    process.env.GTM_VIEWER_TAILNET_ORIGIN = "http://broken";
    assert.equal(await call("http://127.0.0.1:3939/.well-known/workflow/v1/flow"), "next", "half a setting does not stop the queue");
  } finally { process.env = previous; }
});
