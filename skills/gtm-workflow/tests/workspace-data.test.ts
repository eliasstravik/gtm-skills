import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { readWorkspaceData } from "../templates/lib/workspace-data";
import { exportCsv } from "../templates/lib/viewer-csv";
import { readData } from "../templates/lib/data-api";
import { integer, pgTable, text } from "drizzle-orm/pg-core";

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

test("the list opens on a workflow's results and keeps runtime bookkeeping out of sight until asked", async () => {
  await testDatabase();
  const client = db();
  await client.execute("CREATE TABLE public.signup_scores (key TEXT PRIMARY KEY, name TEXT, person_score INTEGER)");
  await client.execute("CREATE TABLE public.unused_results (key TEXT PRIMARY KEY)");
  await client.execute("INSERT INTO public.signup_scores VALUES ('a@x.io', 'Ada', 90)");
  let page = await readWorkspaceData(client, new URL("http://localhost/data"));
  assert.ok(!("unavailable" in page));
  // Bookkeeping (cache, ledger, grants) is hidden; people, companies and the examples show once they hold rows.
  assert.deepEqual(page.tabs.map((t) => t.label), ["signup_scores", "unused_results"]);
  assert.equal(page.tabs.find((t) => t.current)?.label, "signup_scores");
  assert.ok(page.hiddenTables > 0);
  assert.equal(page.pinned, "name");
  await client.execute("INSERT INTO public.example_scores (key, updated_at) VALUES ('acme.com', now())");
  page = await readWorkspaceData(client, new URL("http://localhost/data"));
  assert.ok(!("unavailable" in page));
  assert.deepEqual(page.tabs.map((t) => t.label), ["example_scores", "signup_scores", "unused_results"]);
  assert.equal(page.tabs.find((t) => t.current)?.label, "signup_scores", "a workflow's own table comes before the examples");
  // Asked for: every table, the migration journals still left out; a hidden table named in the URL still opens.
  const all = await readWorkspaceData(client, new URL("http://localhost/data?internal=1"));
  assert.ok(!("unavailable" in all));
  const labels = all.tabs.map((t) => t.label);
  assert.ok(["cache", "companies", "people", "example_scores", "profile_identifiers", "signup_scores"].every((name) => labels.includes(name)));
  assert.deepEqual(labels.filter((name) => /migrations/.test(name)), []);
  assert.equal(all.hiddenTables, 0);
  assert.ok(all.tabs.every((t) => new URL(t.href, "http://localhost").searchParams.get("internal") === "1"));
  const cache = await readWorkspaceData(client, new URL("http://localhost/data?table=cache"));
  assert.ok(!("unavailable" in cache));
  assert.equal(cache.tabs.find((t) => t.current)?.label, "cache");
  // A workflow view labelled by its internal key still names each record by its name column, which the grid pins.
  const signupScores = pgTable("signup_scores", { key: text("key").primaryKey(), name: text("name"), person_score: integer("person_score") });
  const scores = await readData(
    { tables: [{ name: "signupScores", label: "Signup scores", labelColumn: "key", columns: ["key", "name", "person_score"] }] },
    { signupScores }, client, new URL("http://localhost/api/viewer?workflow=w"));
  assert.equal(scores.pinned, "name");
  assert.deepEqual(scores.rows[0].map((cell) => Boolean(cell.href)), [false, true, false]);
  const keyOnly = await readData(
    { tables: [{ name: "signupScores", label: "Signup scores", labelColumn: "key", columns: ["key", "person_score"] }] },
    { signupScores }, client, new URL("http://localhost/api/viewer?workflow=w"));
  assert.equal(keyOnly.pinned, "key");
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
