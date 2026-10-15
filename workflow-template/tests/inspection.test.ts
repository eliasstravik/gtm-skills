import { test, after } from "node:test";
after(() => closeDb());
import assert from "node:assert/strict";
import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { readData, type WorkflowData } from "../templates/lib/data-api";
import { saveLink } from "../templates/lib/viewer-sharing";
import {
  grants,
  policyVersion,
} from "../templates/lib/viewer-grants";
import { csvCell, exportCsv } from "../templates/lib/viewer-csv";
import { publicDisplay } from "../templates/lib/viewer-display";

import type {
  Display,
  DataPolicy,
  View,
} from "../templates/lib/viewer-contract";
process.env.GTM_VIEWER_LINK_KEY = "ab".repeat(32);
const scope = {
  workspace: "acme",
  environment: "production",
  workflowId: "stable",
};
const policy: DataPolicy = {
  version: "1",
  tables: [
    {
      id: "people",
      name: "people",
      columns: ["key", "name"],
      row: { version: "1" },
    },
  ],
  relations: [],
};
test("all seven nonempty scopes authorize metadata and only the selected views", async () => {
  await testDatabase();
  const client = Object.assign(db(), { close() {} });
  try {
    const api = grants(client, scope);
    const all: View[] = ["logic", "runs", "data"];
    for (let mask = 1; mask < 8; mask++) {
      const views = all.filter((_, i) => mask & (1 << i));
      const { token } = await saveLink(
        client,
        scope,
        { views, policy: policyVersion(policy), save: true },
        policy,
      );
      assert.deepEqual(
        (await api.authorize(token, undefined, policy)).views,
        views,
      );
      for (const view of all) {
        if (views.includes(view)) await api.authorize(token, view, policy);
        else
          await assert.rejects(() => api.authorize(token, view, policy), {
            code: "view_denied",
          });
      }
    }
  } finally {
    client.close();
  }
});
test("10,000 records export across pages with the authorized fields, filters and ordering", async () => {
  await testDatabase({ migrated: false });
  const client = Object.assign(db(), { close() {} });
  const people = pgTable("people", {
    key: text().primaryKey(),
    name: text(),
    score: integer(),
    owner: text(),
    secret: text(),
  });
  const config: WorkflowData = {
    tables: [
      {
        name: "people",
        label: "People",
        columns: ["name", "score"],
        labelColumn: "name",
      },
    ],
    rowPolicies: { people: { version: "1", column: "owner", equals: "a" } },
  };
  try {
    await client.execute(
      "CREATE TABLE people (key TEXT PRIMARY KEY, name TEXT, score INTEGER, owner TEXT, secret TEXT)",
    );
    await client.execute(
      "INSERT INTO people SELECT lpad(x::text, 5, '0'), 'Person ' || x, x, CASE WHEN x%2=0 THEN 'a' ELSE 'b' END, 'PRIVATE' FROM generate_series(1, 10000) x",
    );
    const url = new URL(
      "http://localhost/data?q=Person&sort=score&order=desc&columns=name,score",
    );
    const read = (url: URL) => readData(config, { people }, client, url);
    const page = await read(url);
    assert.equal(page.total, 5000);
    assert.equal(page.rows[0][1].value, 10000);
    let reads = 0;
    const started = performance.now();
    const response = await exportCsv(
      url,
      async (u) => {
        reads++;
        return read(u);
      },
      async () => {},
      new AbortController().signal,
    );
    const csv = await response.text();
    assert.equal(csv.split("\r\n").length, 5002);
    // Windows of MAX_LIST_ROWS (200): 5,000 matching rows in 25 reads.
    assert.equal(reads, 25);
    assert.ok(csv.startsWith('"name","score"\r\n"Person 10000","10000"'));
    assert.ok(!csv.includes("PRIVATE"));
    for (const suffix of [
      "sort=secret",
      "field=secret&value=PRIVATE",
      "table=other",
      "sort=name%22%3BDROP+TABLE+people",
    ]) {
      const denied = new URL(url);
      for (const [key, value] of new URLSearchParams(suffix))
        denied.searchParams.set(key, value);
      await assert.rejects(() => read(denied));
    }
    const denied = new URL(url);
    denied.searchParams.set("columns", "secret");
    await assert.rejects(() =>
      exportCsv(denied, read, async () => {}, new AbortController().signal),
    );
    console.log(
      `Exported 5,000 authorized rows from 10,000 in ${Math.round(performance.now() - started)} ms using ${reads} pages.`,
    );
  } finally {
    client.close();
  }
});
test("CSV neutralizes formulas and a revoked grant aborts subsequent output", async () => {
  assert.equal(csvCell('=HYPERLINK("private")'), '"\'=HYPERLINK(""private"")"');
  assert.equal(csvCell("a,\nb"), '"a,\nb"');
  let revoked = false;
  const page = {
    title: "People",
    tabs: [],
    columns: ["Name"],
    rows: [[{ value: "A" }]],
    total: 50,
    keys: ["a"],
    fields: [{ id: "name", label: "Name", type: "text" }],
    all: "",
    next: "yes",
  };
  const response = await exportCsv(
    new URL("http://localhost/data"),
    async () => page,
    async () => {
      if (revoked) throw Error("revoked");
    },
    new AbortController().signal,
  );
  const reader = response.body!.getReader();
  await reader.read();
  revoked = true;
  await assert.rejects(async () => {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
    }
  }, /revoked/);
});
test("recipient business projection excludes owner details and compiler graphs", () => {
  const display: Display = {
    id: "x",
    slug: "x",
    title: "Workflow",
    workflowName: "private",
    revision: "1",
    graph: {
      nodes: [{ id: "technical", type: "step", data: { label: "PRIVATE" } }],
      edges: [],
    },
    businessGraph: {
      nodes: [
        {
          id: "a",
          label: "Find people",
          kind: "action",
          explanation: "Find matching people.",
          details: { notes: "PRIVATE" },
          source: { path: "workflows/private.ts" },
        },
      ],
      edges: [],
    },
  };
  const publicValue = publicDisplay(display, true);
  assert.equal(publicValue.businessGraph?.nodes[0].label, "Find people");
  assert.ok(!JSON.stringify(publicValue).includes("PRIVATE"));
  assert.ok(!JSON.stringify(publicValue).includes("private.ts"));
  assert.equal(publicDisplay(display, false).businessGraph, undefined);
  assert.equal(
    publicDisplay({ ...display, businessGraph: undefined }, true).businessGraph,
    undefined,
  );
  assert.equal(
    publicDisplay(display, true, true).businessGraph?.nodes[0].details?.notes,
    "PRIVATE",
  );
});
