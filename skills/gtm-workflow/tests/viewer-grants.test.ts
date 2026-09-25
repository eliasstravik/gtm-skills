import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { randomBytes } from "node:crypto";
import {
  grants,
  policyVersion,
} from "../templates/lib/viewer-grants";
import { saveLink } from "../templates/lib/viewer-sharing";
import {
  requireMutation,
  csrfCookie,
  privateAccess,
} from "../templates/lib/viewer-access";
import { CONNECTION_ACCESS_PROBE } from "../templates/lib/connections-access";
import type { DataPolicy } from "../templates/lib/viewer-contract";
process.env.GTM_VIEWER_LINK_KEY = randomBytes(32).toString("hex");
const scope = {
  workspace: "workspace-a",
  environment: "production",
  workflowId: "identity-a",
};
const policy: DataPolicy = {
  version: "1",
  tables: [
    {
      id: "people-v1",
      name: "people",
      columns: ["key", "name"],
      row: { version: "1", column: "owner", equals: "a" },
    },
  ],
  relations: [],
};
async function fixture() {
  await testDatabase();
  const client = Object.assign(db(), { close() {} });
  return { client, api: grants(client, scope) };
}
after(closeDb);
test("default Diagram link has no expiry and recovers the same encrypted secret", async () => {
  const { client, api } = await fixture();
  try {
    const first = await saveLink(client, scope, {});
    assert.deepEqual(first.grant.views, ["logic"]);
    assert.equal(first.grant.expiresAt, null);
    assert.equal((await saveLink(client, scope, {})).token, first.token);
    const rows = await client.execute("SELECT * FROM gtm.gtm_viewer_grants");
    assert.equal(rows.rows.length, 1);
    assert.ok(!JSON.stringify(rows.rows).includes(first.token));
    await api.authorize(first.token, "logic");
    await assert.rejects(() => api.authorize(first.token, "data"), {
      code: "view_denied",
    });
  } finally {
    client.close();
  }
});
test("concurrent owners converge on one link and scope saves preserve its URL secret", async () => {
  const { client } = await fixture();
  try {
    const a = await saveLink(client, scope, {});
    const results = await Promise.all(
      Array.from({ length: 8 }, () => saveLink(client, scope, {})),
    );
    assert.ok(results.every((x) => x.token === a.token));
    const next = await saveLink(client, scope, { views: ["runs"], save: true });
    assert.equal(next.token, a.token);
    assert.deepEqual(next.grant.views, ["runs"]);
    assert.equal(
      (await client.execute("SELECT * FROM gtm.gtm_viewer_grants")).rows.length,
      1,
    );
  } finally {
    client.close();
  }
});
test("revocation is idempotent and re-enable never revives the old secret", async () => {
  const { client, api } = await fixture();
  try {
    const a = await saveLink(client, scope, {});
    await api.revoke(a.grant.id);
    await api.revoke(a.grant.id);
    const b = await saveLink(client, scope, {});
    assert.notEqual(a.token, b.token);
    await assert.rejects(() => api.authorize(a.token, "logic"), {
      code: "revoked",
    });
    await api.authorize(b.token, "logic");
  } finally {
    client.close();
  }
});
test("Data policy pauses only Data and requires the displayed policy on resave", async () => {
  const { client, api } = await fixture();
  try {
    const a = await saveLink(
      client,
      scope,
      { views: ["logic", "runs", "data"], policy: policyVersion(policy) },
      policy,
    );
    const changed = { ...policy, version: "2" };
    await api.authorize(a.token, "logic", changed);
    await api.authorize(a.token, "runs", changed);
    await api.authorize(a.token, undefined, changed);
    await assert.rejects(() => api.authorize(a.token, "data", changed), {
      code: "policy_changed",
    });
    await assert.rejects(
      () =>
        saveLink(
          client,
          scope,
          { views: a.grant.views, policy: policyVersion(policy), save: true },
          changed,
        ),
      { code: "policy_changed" },
    );
    const b = await saveLink(
      client,
      scope,
      { views: a.grant.views, policy: policyVersion(changed), save: true },
      changed,
    );
    assert.equal(a.token, b.token);
    await api.authorize(a.token, "data", changed);
  } finally {
    client.close();
  }
});
test("scope isolation, ciphertext tampering and lost keys fail closed without replacing links", async () => {
  const { client, api } = await fixture();
  try {
    const a = await saveLink(client, scope, {});
    for (const other of [
      { ...scope, workspace: "b" },
      { ...scope, environment: "preview" },
      { ...scope, workflowId: "b" },
    ])
      await assert.rejects(
        () => grants(client, other).authorize(a.token, "logic"),
        { code: "invalid_grant" },
      );
    const key = process.env.GTM_VIEWER_LINK_KEY;
    delete process.env.GTM_VIEWER_LINK_KEY;
    await assert.rejects(() => saveLink(client, scope, {}), {
      code: "recovery_unavailable",
    });
    await api.authorize(a.token, "logic");
    process.env.GTM_VIEWER_LINK_KEY = randomBytes(32).toString("hex");
    await assert.rejects(() => saveLink(client, scope, {}), {
      code: "recovery_unavailable",
    });
    process.env.GTM_VIEWER_LINK_KEY = key;
    await client.execute(
      "UPDATE gtm.gtm_viewer_grants SET token_ciphertext = '1.bad.bad.bad'",
    );
    await assert.rejects(() => saveLink(client, scope, {}), {
      code: "recovery_unavailable",
    });
    assert.equal(
      (await client.execute("SELECT * FROM gtm.gtm_viewer_grants")).rows.length,
      1,
    );
  } finally {
    client.close();
  }
});
test("malformed scopes and unseen Data policy cannot create a link", async () => {
  const { client } = await fixture();
  try {
    for (const views of [[], ["execute"], ["logic", "logic"], null, "logic"])
      await assert.rejects(() => saveLink(client, scope, { views }), {
        code: "invalid_scope",
      });
    await assert.rejects(() => saveLink(client, scope, { views: ["data"] }), {
      code: "data_unavailable",
    });
    await assert.rejects(
      () => saveLink(client, scope, { views: ["data"] }, policy),
      { code: "policy_changed" },
    );
  } finally {
    client.close();
  }
});
test("browser writes require matching Origin and CSRF cookie/header", async () => {
  const { value, cookie } = csrfCookie();
  const headers = {
    host: "localhost:3939",
    origin: "http://localhost:3939",
    "content-type": "application/json",
    cookie,
    "x-gtm-csrf": value,
  };
  await requireMutation(
    new Request("http://localhost:3939/api/viewer/grants", {
      method: "POST",
      headers,
    }),
  );
  for (const bad of [
    { ...headers, origin: "https://other.test" },
    { ...headers, "x-gtm-csrf": "x" },
    { ...headers, cookie: "" },
  ])
    await assert.rejects(
      requireMutation(
        new Request("http://localhost:3939/api/viewer/grants", {
          method: "POST",
          headers: bad,
        }),
      ),
      { status: 403 },
    );
  await assert.rejects(
    privateAccess(
      new Request("http://evil.test:3939/viewer", {
        headers: { host: "evil.test:3939" },
      }),
    ),
    { code: "host_denied" },
  );
});

test("hosted viewer needs an owner session Vercel confirms, not just a request past Vercel", async () => {
  const origin = "https://gtm-acme.vercel.app", teamId = "team_acme";
  const saved = { ...process.env };
  Object.assign(process.env, { VERCEL: "1", GTM_VIEWER_PROTECTED: "1", GTM_CONNECTIONS_ORIGIN: origin, GTM_CONNECTIONS_TEAM_ID: teamId });
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = (claims: Record<string, unknown>) => `${encode({ alg: "none" })}.${encode(claims)}.signature`;
  const owner = jwt({ userId: "user_a", ownerId: teamId, aud: "gtm-acme.vercel.app", sub: "sso-protection" });
  // Vercel: an anonymous probe is sent to login, the owner's cookie gets the probe text.
  const vercel = async (_url: unknown, init?: RequestInit) =>
    (init?.headers as Record<string, string> | undefined)?.cookie === `_vercel_jwt=${owner}`
      ? new Response(CONNECTION_ACCESS_PROBE)
      : new Response("", { status: 401 });
  const request = (headers: Record<string, string> = {}, query = "") =>
    new Request(`${origin}/api/viewer?v=3${query}`, { headers });
  try {
    await privateAccess(request({ cookie: `_vercel_jwt=${owner}` }), vercel);
    for (const [headers, query] of [
      [{}, ""],
      [{ "x-vercel-protection-bypass": "synthetic" }, ""],
      [{}, "&x-vercel-protection-bypass=synthetic"],
      [{ "x-vercel-trusted-oidc-idp-token": "synthetic" }, ""],
      [{ cookie: `_vercel_jwt=${owner}`, "x-vercel-protection-bypass": "synthetic" }, ""],
      [{ cookie: `_vercel_jwt=${jwt({ userId: "user_a", ownerId: teamId, aud: "gtm-acme.vercel.app", sub: "sso-protection", bypass: true })}` }, ""],
      [{ cookie: `_vercel_jwt=${jwt({ userId: "user_b", ownerId: teamId, aud: "gtm-acme.vercel.app", sub: "sso-protection" })}` }, ""],
    ] as const)
      await assert.rejects(privateAccess(request(headers, query), vercel), { code: "owner_required" }, JSON.stringify(headers) + query);
    // Protection turned off: the anonymous probe gets through, so no session counts.
    await assert.rejects(
      privateAccess(request({ cookie: `_vercel_jwt=${jwt({ userId: "user_c", ownerId: teamId, aud: "gtm-acme.vercel.app", sub: "sso-protection" })}` }), async () => new Response(CONNECTION_ACCESS_PROBE)),
      { code: "owner_required" },
    );
    // A confirmed session is remembered briefly, so viewer polling does not probe Vercel on every request.
    await privateAccess(request({ cookie: `_vercel_jwt=${owner}` }), async () => { throw Error("not probed again"); });
    delete process.env.GTM_CONNECTIONS_ORIGIN;
    await assert.rejects(privateAccess(request({ cookie: `_vercel_jwt=${owner}` }), vercel), { code: "configuration" });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

import { effectivePolicy } from "../templates/lib/viewer-policy";
import { pgTable, text } from "drizzle-orm/pg-core";
test("effective Data authorization rejects exposed columns outside the explicit policy and binds physical schema", () => {
  const people = pgTable("people", {
    key: text("key"),
    name: text("full_name"),
    owner: text("owner"),
    email: text("email"),
  });
  const entry = {
    data: {
      tables: [
        {
          name: "people",
          label: "People",
          labelColumn: "name",
          columns: ["key", "name"],
        },
      ],
    },
    sharePolicy: policy,
  };
  const current = effectivePolicy(entry, { people });
  assert.ok(current);
  assert.equal(
    effectivePolicy(
      {
        ...entry,
        data: {
          tables: [
            { ...entry.data.tables[0], columns: ["key", "name", "email"] },
          ],
        },
      },
      { people },
    ),
    undefined,
  );
  const changed = pgTable("people", {
    key: text("key"),
    name: text("name"),
    owner: text("owner"),
    email: text("email"),
  });
  assert.notEqual(
    policyVersion(current),
    policyVersion(effectivePolicy(entry, { people: changed })),
  );
  assert.equal(
    effectivePolicy(
      {
        ...entry,
        data: { tables: [{ ...entry.data.tables[0], labelColumn: "email" }] },
      },
      { people },
    ),
    undefined,
  );
});
