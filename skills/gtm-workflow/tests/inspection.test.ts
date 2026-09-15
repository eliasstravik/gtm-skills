import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { readData, type WorkflowData } from "../templates/lib/data-api";
import { grants, migrateViewer } from "../templates/lib/viewer-grants";
import { csvCell, exportCsv } from "../templates/lib/viewer-csv";
import {
  publicDisplay,
  stageGraph,
  validateStages,
} from "../templates/lib/viewer-display";
import { summarizeRun } from "../templates/lib/viewer-summary";
import type {
  Display,
  DataPolicy,
  View,
} from "../templates/lib/viewer-contract";
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
  const client = createClient({ url: ":memory:" });
  await migrateViewer(client);
  try {
    const api = grants(client, scope);
    const all: View[] = ["logic", "runs", "data"];
    for (let mask = 1; mask < 8; mask++) {
      const views = all.filter((_, i) => mask & (1 << i));
      const { token } = await api.create({ views, expiresAt: null }, policy);
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
  const client = createClient({ url: ":memory:" });
  const people = sqliteTable("people", {
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
      "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<10000) INSERT INTO people SELECT printf('%05d', x), 'Person ' || x, x, CASE WHEN x%2=0 THEN 'a' ELSE 'b' END, 'PRIVATE' FROM n",
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
    assert.equal(reads, 200);
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
test("summary scans beyond the selected 25 invocations and reports bounded scans as partial", async () => {
  const result = await summarizeRun(async (cursor) => ({
    data: Array.from({ length: cursor ? 15 : 25 }, () => ({
      status: "completed",
    })),
    cursor: cursor ? undefined : "next",
    hasMore: !cursor,
  }));
  assert.deepEqual(result, {
    complete: true,
    count: 40,
    statuses: { completed: 40 },
  });
  assert.equal(
    (
      await summarizeRun(async () => ({
        data: [{ status: "failed" }],
        cursor: "same",
        hasMore: true,
      }))
    ).complete,
    false,
  );
});
test("recipient diagram strips arbitrary nested metadata; grouping preserves labelled branches and loops", () => {
  const display: Display = {
    id: "x",
    slug: "x",
    title: "Inspect",
    workflowName: "private",
    revision: "1",
    graph: {
      nodes: ["a", "b", "c"].map((id) => ({
        id,
        type: "step",
        data: { label: id, stepId: "private-step" },
        metadata: { nested: { secret: "PRIVATE" } },
      })),
      edges: [
        { id: "ab", source: "a", target: "b" },
        { id: "bc", source: "b", target: "c", label: "Yes" },
        { id: "ca", source: "c", target: "a", type: "loop", label: "Again" },
      ],
    },
    stages: [
      {
        id: "stage",
        title: "Prepare",
        description: "Prepare rows",
        nodes: ["a", "b"],
      },
    ],
  };
  assert.ok(!JSON.stringify(publicDisplay(display, true)).includes("PRIVATE"));
  assert.ok(!("graph" in publicDisplay(display, false)));
  validateStages(display.graph!, display.stages);
  assert.throws(() =>
    validateStages(display.graph!, [
      ...display.stages!,
      { id: "other", title: "Other", description: "x", nodes: ["a"] },
    ]),
  );
  const graph = stageGraph(display.graph!, display.stages);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges[0].label, "Yes");
  assert.equal(graph.edges[1].type, "loop");
});
