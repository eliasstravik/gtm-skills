import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { localAuth } from "../local/auth.mjs";
import { mutation } from "../src/validation.mjs";
import { configuredNames, connectionInventory } from "../dist/catalog.mjs";
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
