import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import {
  grants,
  migrateViewer,
  policyVersion,
} from "../templates/lib/viewer-grants";
import {
  requireMutation,
  csrfCookie,
  privateAccess,
} from "../templates/lib/viewer-access";
import type { DataPolicy } from "../templates/lib/viewer-contract";
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
  let now = 100000;
  return {
    client,
    api: grants(client, scope, () => now),
    advance: (ms: number) => (now += ms),
  };
}
test("default links expire in seven days, retain only token hashes, and grant Logic only", async () => {
  const { client, api, advance } = await fixture();
  try {
    const { token, grant } = await api.create({});
    assert.deepEqual(grant.views, ["logic"]);
    assert.equal(grant.expiresAt! - grant.createdAt, 7 * 86400000);
    assert.equal((await api.authorize(token, "logic")).id, grant.id);
    await assert.rejects(() => api.authorize(token, "runs"), {
      code: "view_denied",
    });
    const rows = await client.execute("SELECT * FROM gtm_viewer_grants");
    assert.ok(!JSON.stringify(rows.rows).includes(token));
    advance(7 * 86400000);
    await assert.rejects(() => api.authorize(token, "logic"), {
      code: "expired",
    });
  } finally {
    client.close();
  }
});
test("revocation applies to an open link and does not depend on expiry", async () => {
  const { client, api, advance } = await fixture();
  try {
    const { token, grant } = await api.create({ expiresAt: null });
    advance(100 * 86400000);
    await api.authorize(token, "logic");
    await api.revoke(grant.id);
    await assert.rejects(() => api.authorize(token, "logic"), {
      code: "revoked",
    });
  } finally {
    client.close();
  }
});
test("workspace, environment and immutable identity isolate grants, independently of slugs", async () => {
  const { client, api } = await fixture();
  try {
    const { token } = await api.create({ expiresAt: null });
    for (const other of [
      { ...scope, workspace: "b" },
      { ...scope, environment: "preview" },
      { ...scope, workflowId: "new-identity-same-slug" },
    ])
      await assert.rejects(
        () => grants(client, other).authorize(token, "logic"),
        { code: "invalid_grant" },
      );
    await api.authorize(token, "logic");
  } finally {
    client.close();
  }
});
test("every authorization policy change locks Data without removing separately granted Logic or Runs", async () => {
  const { client, api } = await fixture();
  try {
    const { token } = await api.create(
      { views: ["logic", "runs", "data"] },
      policy,
    );
    await api.authorize(token, "data", policy);
    const variants: DataPolicy[] = [
      { ...policy, version: "2" },
      {
        ...policy,
        tables: [
          ...policy.tables,
          {
            id: "companies",
            name: "companies",
            columns: ["key"],
            row: { version: "1" },
          },
        ],
      },
      {
        ...policy,
        tables: [{ ...policy.tables[0], columns: ["key", "name", "email"] }],
      },
      { ...policy, tables: [{ ...policy.tables[0], row: { version: "2" } }] },
      {
        ...policy,
        relations: [
          {
            from: "people",
            to: "companies",
            through: "employment",
            fromColumn: "person",
            toColumn: "company",
          },
        ],
      },
    ];
    for (const changed of variants) {
      await assert.rejects(() => api.authorize(token, "data", changed), {
        code: "policy_changed",
      });
      await api.authorize(token, "logic", changed);
      await api.authorize(token, "runs", changed);
    }
    assert.equal(
      policyVersion(policy),
      policyVersion(JSON.parse(JSON.stringify(policy))),
    );
  } finally {
    client.close();
  }
});
test("malformed scope, expiry, tokens and unregistered data fail closed", async () => {
  const { client, api } = await fixture();
  try {
    for (const views of [
      ["runs"],
      ["logic", "execute"],
      ["logic", "logic"],
      null,
      "logic",
    ])
      await assert.rejects(() => api.create({ views }));
    for (const expiresAt of [0, "forever", -1, Infinity])
      await assert.rejects(() => api.create({ expiresAt }));
    await assert.rejects(() => api.create({ views: ["logic", "data"] }));
    await assert.rejects(() => api.authorize("' OR 1=1 --", "logic"));
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

import { mapSteps } from "../templates/lib/viewer-mapping";
test("repeated call sites require a unique, verified mapping and do not infer order", () => {
  const display: any = {
    graph: {
      nodes: [
        { id: "first", data: { stepId: "lookup" } },
        { id: "second", data: { stepId: "lookup" } },
      ],
    },
  };
  const steps = [
    {
      id: "a",
      name: "lookup",
      input: { state: "available", value: { args: ["primary"] } },
    },
    {
      id: "b",
      name: "lookup",
      input: { state: "available", value: { args: ["related"] } },
    },
  ];
  assert.deepEqual(mapSteps(display, steps), {});
  display.mappings = [
    {
      nodeId: "first",
      stepName: "lookup",
      argument: { path: ["args", 0], equals: "primary" },
    },
    {
      nodeId: "second",
      stepName: "lookup",
      argument: { path: ["args", 0], equals: "related" },
    },
  ];
  assert.deepEqual(mapSteps(display, steps), { first: ["a"], second: ["b"] });
  assert.deepEqual(
    mapSteps(display, [{ ...steps[0], input: { state: "locked" } }]),
    {},
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
