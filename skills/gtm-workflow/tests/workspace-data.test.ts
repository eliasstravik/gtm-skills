import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { readWorkspaceData } from "../templates/lib/workspace-data";
import { exportCsv } from "../templates/lib/viewer-csv";

// An unmigrated database: only what each test creates, reached as the app's plain role.
async function database() {
  await testDatabase({ migrated: false });
  const client = db();
  return Object.assign(client, { close() {} });
}
after(closeDb);

test("discovers unregistered tables and supports search, sort, pagination, details and full export", async () => {
  const client = await database();
  const url = new URL("http://localhost/api/viewer?view=data&table=contacts");
  try {
    assert.deepEqual(await readWorkspaceData(client, url), { unavailable: "No data tables yet." });
    await client.execute("CREATE TABLE contacts (id INTEGER PRIMARY KEY, name TEXT, score INTEGER, seen_at TIMESTAMPTZ, active BOOLEAN, facts JSONB)");
    await client.execute("INSERT INTO contacts SELECT x, 'Person ' || x, x, timestamptz '2026-09-01T10:00:00.123Z', x % 2 = 0, jsonb_build_object('n', x) FROM generate_series(1, 61) x");
    await client.execute("CREATE TABLE standalone (note TEXT)");
    let page = await readWorkspaceData(client, url);
    assert.ok(!("unavailable" in page));
    assert.deepEqual(page.tabs.map((t) => t.label), ["contacts", "standalone"]);
    assert.equal(page.total, 61);
    assert.equal(page.rows.length, 25);
    assert.ok(page.next);
    assert.deepEqual(page.availableFields?.map((f) => f.id), ["id", "name", "score", "seen_at", "active", "facts"]);
    // Real types read as themselves: a time as ISO text in UTC, a flag as a boolean. A list leaves JSON in the database.
    assert.deepEqual(page.rows[0].slice(3, 5).map((cell) => cell.value), ["2026-09-01T10:00:00.123Z", false]);
    assert.deepEqual(page.rows[0][5], { value: null, folded: {} });
    // A window of rows further down, as the grid scrolls.
    const window = new URL(url); window.searchParams.set("sort", "id"); window.searchParams.set("offset", "50"); window.searchParams.set("limit", "100");
    const later = await readWorkspaceData(client, window);
    assert.ok(!("unavailable" in later));
    assert.equal(later.offset, 50);
    assert.deepEqual(later.rows.map((row) => row[0].value), [51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61]);
    assert.equal(later.next, undefined);
    const lowercase = new URL(url); lowercase.searchParams.set("q", "person 61");
    const found = await readWorkspaceData(client, lowercase);
    assert.ok(!("unavailable" in found));
    assert.equal(found.total, 1, "search ignores case");
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
    // A single record carries its JSON whole.
    assert.deepEqual(record.rows[0][5].value, { n: 61 });
    url.searchParams.set("format", "json");
    const response = await exportCsv(url, async (u) => {
      const result = await readWorkspaceData(client, u);
      assert.ok(!("unavailable" in result));
      return result;
    }, async () => {}, new AbortController().signal);
    const rows = await response.json();
    assert.equal(rows.length, 51);
    assert.equal(rows[50].score, 11);
    assert.deepEqual(rows[50].facts, { n: 11 }, "an export carries JSON whole");
    assert.equal(new Set(rows.map((r: any) => r.id)).size, 51);
    for (const query of ["table=missing", "table=contacts&sort=missing", "table=contacts&key=invalid", "table=contacts&field=id%22%3BDELETE", "table=contacts&field=score&operator=gt&value=ten"])
      await assert.rejects(() => readWorkspaceData(client, new URL(`http://localhost/?${query}`)));
    assert.equal((await client.execute("SELECT count(*)::int AS n FROM contacts")).rows[0].n, 61);
  } finally { client.close(); }
});

test("runtime and workspace tables are listed together and the migration journals are not", async () => {
  await testDatabase();
  const page = await readWorkspaceData(db(), new URL("http://localhost/data?table=people"));
  assert.ok(!("unavailable" in page));
  const labels = page.tabs.map((t) => t.label);
  assert.ok(["cache", "companies", "people", "example_scores", "profile_identifiers"].every((name) => labels.includes(name)));
  assert.deepEqual(labels.filter((name) => /migrations/.test(name)), []);
  assert.equal(page.total, 0);
});

test("tables without a key, composite keys, generated columns and quoted identifiers remain browsable", async () => {
  const client = await database();
  try {
    // No primary key: a row is identified by all its columns (JSON left out), nulls included.
    await client.execute('CREATE TABLE "odd table" ("quoted""field" TEXT, quantity INTEGER, doubled INTEGER GENERATED ALWAYS AS (quantity * 2) STORED, note TEXT, extra JSONB)');
    await client.execute('INSERT INTO "odd table" ("quoted""field", quantity, note, extra) VALUES (\'same\', 3, NULL, \'{"a":1}\'), (\'same\', 4, NULL, NULL)');
    await client.execute("CREATE TABLE pairs (a TEXT, b INTEGER, name TEXT, PRIMARY KEY (a,b))");
    await client.execute("INSERT INTO pairs VALUES ('x', 1, 'Same'), ('x', 2, 'Same')");
    await client.execute("CREATE TABLE binary_keys (id BYTEA PRIMARY KEY, name TEXT, raw_json TEXT)");
    await client.execute("INSERT INTO binary_keys VALUES ('\\x0102', 'First', 'not json'), ('\\x0304', 'Second', '{}')");
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
