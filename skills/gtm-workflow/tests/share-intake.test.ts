// The public webhook relay on the share project: unsigned requests stop there, signed ones reach the private
// runtime's intake route unchanged, with the share project's OIDC identity and nothing else of the caller's.
import { test } from "node:test";
import assert from "node:assert/strict";
import route from "../templates/share-server/api/intake/[slug].post";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const oidc = `${encode({ alg: "none" })}.${encode({ exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
Object.assign(process.env, { VERCEL_ENV: "production", GTM_VIEWER_PRIVATE_ORIGIN: "https://gtm-acme.vercel.app", VERCEL_OIDC_TOKEN: oidc });

type Call = { url: string; init: RequestInit };
function upstream(reply: () => Response) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: URL, init: RequestInit) => { calls.push({ url: String(url), init }); return reply(); }) as typeof fetch;
  return calls;
}
const post = (slug: string, headers: Record<string, string>, body = '{"triggerEvent":"PING"}') =>
  (route as unknown as (event: unknown) => Promise<Response>)({
    req: new Request(`https://gtm-acme-share.vercel.app/api/intake/${slug}`, { method: "POST", headers, body }),
    context: { params: { slug } },
  });

test("forwards a signed event byte for byte with the OIDC identity and only signature headers", async () => {
  const calls = upstream(() => Response.json({ id: "run_1" }, { status: 202 }));
  const body = '{"triggerEvent":"BOOKING_CREATED","payload":{"uid":"x"}}';
  const response = await post("cal-booking", {
    "content-type": "application/json", "x-cal-signature-256": "abc123", cookie: "_vercel_jwt=someone",
    authorization: "Bearer stolen", "x-vercel-protection-bypass": "leaked",
  }, body);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { id: "run_1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://gtm-acme.vercel.app/api/intake/cal-booking");
  const sent = calls[0].init.headers as Record<string, string>;
  assert.equal(sent["x-cal-signature-256"], "abc123");
  assert.equal(sent["x-vercel-trusted-oidc-idp-token"], oidc);
  for (const name of ["cookie", "authorization", "x-vercel-protection-bypass"]) assert.ok(!(name in sent), name);
  assert.equal(Buffer.from(calls[0].init.body as Uint8Array).toString(), body);
  assert.equal(calls[0].init.redirect, "error");
});

test("refuses unsigned requests, bad slugs and oversized bodies before reaching the private runtime", async () => {
  const calls = upstream(() => Response.json({}));
  assert.equal((await post("cal-booking", { "content-type": "application/json" })).status, 401);
  // Vercel's own proxy signature is on every request and is not the sender's.
  assert.equal((await post("cal-booking", { "x-vercel-proxy-signature": "Bearer x", "x-vercel-proxy-signature-ts": "1" })).status, 401);
  assert.equal((await post("../run/x", { "x-cal-signature-256": "a" })).status, 404);
  assert.equal((await post("cal-booking", { "x-cal-signature-256": "a" }, "x".repeat(1024 * 1024 + 1))).status, 413);
  assert.equal(calls.length, 0);
});

test("a workflow without an intake is a 404, not a relay fault", async () => {
  upstream(() => new Response("No intake for x", { status: 404, headers: { "content-type": "text/plain" } }));
  assert.equal((await post("x", { "x-cal-signature-256": "a" })).status, 404);
});

test("the sender's headers never include Vercel's own", async () => {
  const calls = upstream(() => Response.json({}, { status: 202 }));
  await post("cal-booking", { "x-cal-signature-256": "a", "x-vercel-proxy-signature": "Bearer x", "x-vercel-id": "iad1::x" });
  const sent = calls[0].init.headers as Record<string, string>;
  assert.ok(!Object.keys(sent).some((name) => name.startsWith("x-vercel-") && name !== "x-vercel-trusted-oidc-idp-token"));
});

test("a Vercel login page from the private runtime is a relay fault, not a sender error", async () => {
  upstream(() => new Response("<html>Authentication Required</html>", { status: 401, headers: { "content-type": "text/html" } }));
  assert.equal((await post("cal-booking", { "stripe-signature": "t=1,v1=a" })).status, 502);
});

test("outside production the relay is off", async () => {
  process.env.VERCEL_ENV = "preview";
  try { assert.equal((await post("cal-booking", { "x-hub-signature-256": "sha256=a" })).status, 503); }
  finally { process.env.VERCEL_ENV = "production"; }
});
