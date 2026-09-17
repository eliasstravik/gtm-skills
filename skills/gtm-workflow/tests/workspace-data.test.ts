import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { readWorkspaceData } from "../templates/lib/workspace-data";
import { exportCsv } from "../templates/lib/viewer-csv";

test("discovers unregistered tables and supports search, sort, pagination, details and full export", async () => {
  const client = createClient({ url: ":memory:" });
  const url = new URL("http://localhost/api/viewer?view=data&table=contacts");
  try {
    assert.deepEqual(await readWorkspaceData(client, url), { unavailable: "No data tables yet." });
    await client.execute("CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT, score INTEGER)");
    await client.execute("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<61) INSERT INTO contacts SELECT x, 'Person ' || x, x FROM n");
    await client.execute("CREATE TABLE standalone (note TEXT)");
    let page = await readWorkspaceData(client, url);
    assert.ok(!("unavailable" in page));
    assert.deepEqual(page.tabs.map((t) => t.label), ["contacts", "standalone"]);
    assert.equal(page.total, 61);
    assert.equal(page.rows.length, 25);
    assert.ok(page.next);
    assert.deepEqual(page.availableFields?.map((f) => f.id), ["id", "name", "score"]);
    url.searchParams.set("sort", "score");
    url.searchParams.set("order", "desc");
    url.searchParams.set("field", "score");
    url.searchParams.set("operator", "gt");
    url.searchParams.set("value", "10");
    page = await readWorkspaceData(client, url);
    assert.ok(!("unavailable" in page));
    assert.equal(page.total, 51);
    assert.equal(page.rows[0][2].value, 61);
    const detail = new URL(page.rows[0][1].href!, url);
    const record = await readWorkspaceData(client, detail);
    assert.ok(!("unavailable" in record));
    assert.equal(record.total, 1);
    assert.equal(record.rows[0][0].value, 61);
    url.searchParams.set("format", "json");
    const response = await exportCsv(url, async (u) => {
      const result = await readWorkspaceData(client, u);
      assert.ok(!("unavailable" in result));
      return result;
    }, async () => {}, new AbortController().signal);
    const rows = await response.json();
    assert.equal(rows.length, 51);
    assert.equal(rows[50].score, 11);
    assert.equal(new Set(rows.map((r: any) => r.id)).size, 51);
    for (const query of ["table=missing", "table=contacts&sort=missing", "table=contacts&key=invalid", "table=contacts&field=id%22%3BDELETE"])
      await assert.rejects(() => readWorkspaceData(client, new URL(`http://localhost/?${query}`)));
    assert.equal((await client.execute("SELECT COUNT(*) AS n FROM contacts")).rows[0].n, 61);
  } finally { client.close(); }
});

test("tables without a key, composite keys, generated columns and quoted identifiers remain browsable", async () => {
  const client = createClient({ url: ":memory:" });
  try {
    await client.execute('CREATE TABLE "odd table" ("quoted""field" TEXT, quantity INTEGER, doubled INTEGER GENERATED ALWAYS AS (quantity * 2))');
    await client.execute('INSERT INTO "odd table" ("quoted""field", quantity) VALUES (\'same\', 3), (\'same\', 3)');
    await client.execute("CREATE TABLE pairs (a TEXT, b INTEGER, name TEXT, PRIMARY KEY (a,b)) WITHOUT ROWID");
    await client.execute("INSERT INTO pairs VALUES ('x', 1, 'Same'), ('x', 2, 'Same')");
    await client.execute("CREATE TABLE binary_keys (id BLOB PRIMARY KEY, name TEXT, raw_json TEXT) WITHOUT ROWID");
    await client.execute("INSERT INTO binary_keys VALUES (x'0102', 'First', 'not json'), (x'0304', 'Second', '{}')");
    for (const table of ["odd table", "pairs", "binary_keys"]) {
      const url = new URL("http://localhost/data");
      url.searchParams.set("table", table);
      const page = await readWorkspaceData(client, url);
      assert.ok(!("unavailable" in page));
      assert.equal(page.total, 2);
      assert.equal(new Set(page.keys).size, 2);
      const linked = page.rows[1].find((cell) => cell.href)!;
      const record = await readWorkspaceData(client, new URL(linked.href!, url));
      assert.ok(!("unavailable" in record));
      assert.equal(record.total, 1);
      if (table === "odd table") assert.equal(page.rows[0][2].value, 6);
      if (table === "binary_keys") {
        assert.equal(page.rows[0][0].value, "0102");
        assert.equal(page.rows[0][2].value, "not json");
      }
    }
  } finally { client.close(); }
});
