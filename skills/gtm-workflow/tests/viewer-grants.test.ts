import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { randomBytes } from "node:crypto";
import {
  grants,
  migrateViewer,
  policyVersion,
} from "../templates/lib/viewer-grants";
import { saveLink } from "../templates/lib/viewer-sharing";
import {
  requireMutation,
  csrfCookie,
  privateAccess,
} from "../templates/lib/viewer-access";
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
  const client = createClient({ url: ":memory:" });
  await migrateViewer(client);
  return { client, api: grants(client, scope) };
}
test("default Diagram link has no expiry and recovers the same encrypted secret", async () => {
  const { client, api } = await fixture();
  try {
    const first = await saveLink(client, scope, {});
    assert.deepEqual(first.grant.views, ["logic"]);
    assert.equal(first.grant.expiresAt, null);
    assert.equal((await saveLink(client, scope, {})).token, first.token);
    const rows = await client.execute("SELECT * FROM gtm_viewer_grants");
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
      (await client.execute("SELECT * FROM gtm_viewer_grants")).rows.length,
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
      "UPDATE gtm_viewer_grants SET token_ciphertext = '1.bad.bad.bad'",
    );
    await assert.rejects(() => saveLink(client, scope, {}), {
      code: "recovery_unavailable",
    });
    assert.equal(
      (await client.execute("SELECT * FROM gtm_viewer_grants")).rows.length,
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
test("browser writes require matching Origin and CSRF cookie/header", () => {
  const { value, cookie } = csrfCookie();
  const headers = {
    host: "localhost:3939",
    origin: "http://localhost:3939",
    "content-type": "application/json",
    cookie,
    "x-gtm-csrf": value,
  };
  requireMutation(
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
    assert.throws(
      () =>
        requireMutation(
          new Request("http://localhost:3939/api/viewer/grants", {
            method: "POST",
            headers: bad,
          }),
        ),
      { status: 403 },
    );
  assert.throws(
    () =>
      privateAccess(
        new Request("http://evil.test:3939/viewer", {
          headers: { host: "evil.test:3939" },
        }),
      ),
    { code: "host_denied" },
  );
});

import { effectivePolicy } from "../templates/lib/viewer-policy";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
test("effective Data authorization rejects exposed columns outside the explicit policy and binds physical schema", () => {
  const people = sqliteTable("people", {
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
  const changed = sqliteTable("people", {
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
