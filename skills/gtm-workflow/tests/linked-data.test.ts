import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createClient } from "@libsql/client";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  readData,
  renderData,
  type WorkflowData,
} from "../templates/lib/data-api";
import { signLink, verifyLink } from "../templates/lib/sign";

const people = sqliteTable("network_people", {
  key: text("key").primaryKey(),
  name: text("full_name"),
});
const companies = sqliteTable("network_companies", {
  key: text("key").primaryKey(),
  name: text("name"),
});
const employment = sqliteTable("network_employment", {
  key: text("key").primaryKey(),
  person: text("person_key"),
  company: text("company_key"),
});
const privateTable = sqliteTable("private_table", {
  key: text("key").primaryKey(),
  secret: text("secret"),
});
const registry = { people, companies, employment, privateTable };
const config: WorkflowData = {
  tables: [
    {
      name: "people",
      label: "People",
      labelColumn: "name",
      columns: ["key", "name"],
    },
    {
      name: "companies",
      label: "Companies",
      labelColumn: "name",
      columns: ["key", "name"],
    },
  ],
  relations: [
    {
      from: "people",
      to: "companies",
      through: "employment",
      fromColumn: "person",
      toColumn: "company",
    },
  ],
};
const client = createClient({ url: ":memory:" });
await client.executeMultiple(`
  CREATE TABLE network_people (key TEXT PRIMARY KEY, full_name TEXT);
  CREATE TABLE network_companies (key TEXT PRIMARY KEY, name TEXT);
  CREATE TABLE network_employment (key TEXT PRIMARY KEY, person_key TEXT, company_key TEXT);
  CREATE TABLE private_table (key TEXT PRIMARY KEY, secret TEXT);
  INSERT INTO network_people VALUES ('alice', 'Alice'), ('bob', 'Bob');
  INSERT INTO network_companies VALUES ('acme', 'Acme'), ('beta', 'Beta');
  INSERT INTO network_employment VALUES ('a1','alice','acme'), ('a2','alice','acme'), ('a3','alice','beta'), ('b1','bob','acme');
  INSERT INTO private_table VALUES ('hidden', 'Never display this');
`);
after(() => client.close());
const url = (query = "") =>
  new URL(`http://localhost/gtm/network/data?t=test-token&${query}`);
const read = (query = "") => readData(config, registry, client, url(query));

test("people link to distinct companies, and companies link back to all people", async () => {
  const page = await read("table=people&key=alice");
  assert.equal(page.rows[0][2].value, "View 2");
  const linked = await readData(
    config,
    registry,
    client,
    new URL(page.rows[0][2].href!, url()),
  );
  assert.deepEqual(
    linked.rows.map((r) => r[1].value),
    ["Acme", "Beta"],
  );
  assert.equal(linked.context, "Connected to Alice");
  assert.equal(linked.rows[0][2].value, "View 2");
  const back = await readData(
    config,
    registry,
    client,
    new URL(linked.rows[0][2].href!, url()),
  );
  assert.deepEqual(
    back.rows.map((r) => r[1].value),
    ["Alice", "Bob"],
  );
  assert.equal(back.context, "Connected to Acme");
  assert.ok(back.tabs.every((t) => t.href.includes("t=test-token")));
});

test("physical column names may differ from registry property names", async () => {
  const page = await read("table=people&key=alice");
  assert.equal(page.rows[0][1].value, "Alice");
});

test("unregistered views, prototype keys and relationship filters are refused", async () => {
  for (const query of [
    "table=privateTable",
    "table=employment",
    "table=constructor",
    "relatedTable=privateTable&relatedKey=hidden",
    "relatedTable=companies",
    "page=-1",
    "page=NaN",
    "page=999999999999999",
  ]) {
    await assert.rejects(read(query));
  }
});

test("row and relationship keys cannot inject SQL", async () => {
  const injection = encodeURIComponent("' OR 1=1 --");
  assert.equal((await read(`key=${injection}`)).rows.length, 0);
  assert.equal(
    (await read(`relatedTable=companies&relatedKey=${injection}`)).rows.length,
    0,
  );
  assert.equal((await read()).rows.length, 2);
});

test("related records paginate without duplicate people from duplicate roles", async () => {
  for (let i = 0; i < 28; i++) {
    await client.execute({
      sql: "INSERT INTO network_people VALUES (?, ?)",
      args: [`p${i.toString().padStart(2, "0")}`, `Person ${i}`],
    });
    await client.execute({
      sql: "INSERT INTO network_employment VALUES (?, ?, 'acme')",
      args: [`role${i}`, `p${i.toString().padStart(2, "0")}`],
    });
  }
  const first = await read(
    "table=people&relatedTable=companies&relatedKey=acme",
  );
  assert.equal(first.rows.length, 25);
  assert.ok(first.next);
  const second = await readData(
    config,
    registry,
    client,
    new URL(first.next, url()),
  );
  assert.equal(second.rows.length, 5);
  assert.equal(second.next, undefined);
  assert.ok(second.previous?.includes("relatedKey=acme"));
  assert.equal(
    new Set([...first.rows, ...second.rows].map((r) => r[0].value)).size,
    30,
  );
});

test("empty and unmatched records remain usable", async () => {
  const page = await read("key=missing");
  assert.equal(page.rows.length, 0);
  assert.match(renderData(page), /No records found/);
  assert.ok(page.all.includes("table=people"));
});

test("stored content and links are escaped in HTML", async () => {
  await client.execute({
    sql: "INSERT INTO network_people VALUES (?, ?)",
    args: ["evil", '<script>alert("x")</script>'],
  });
  const html = renderData(await read("key=evil"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("Never display this"));
});

test("data tokens cannot be substituted with diagram or another workflow's tokens", () => {
  process.env.GTM_RUN_SECRET = "fixture-secret-not-a-real-credential";
  assert.equal(verifyLink("data:network", signLink("data:network")), true);
  assert.equal(verifyLink("data:network", signLink("network")), false);
  assert.equal(
    verifyLink("data:network", signLink("data:another-network")),
    false,
  );
  assert.equal(verifyLink("data:network", signLink("data:network", -1)), false);
  assert.equal(verifyLink("data:network", null), false);
  assert.equal(
    verifyLink("data:network", `${Date.now() + 100000}.${"é".repeat(43)}`),
    false,
  );
});

test("row policies constrain table reads, relationship labels and related-record counts", async () => {
  const scoped: WorkflowData = {
    ...config,
    rowPolicies: {
      people: { version: "1", column: "key", equals: "alice" },
      companies: { version: "1", column: "key", equals: "acme" },
      employment: { version: "1", column: "person", equals: "alice" },
    },
  };
  const page = await readData(scoped, registry, client, url("table=people"));
  assert.equal(page.rows.length, 1);
  assert.equal(page.rows[0][2].value, "View 1");
  const related = await readData(
    scoped,
    registry,
    client,
    url("table=companies&relatedTable=people&relatedKey=alice"),
  );
  assert.equal(related.rows.length, 1);
  assert.equal(related.rows[0][1].value, "Acme");
  assert.equal(related.rows[0][2].value, "View 1");
  await assert.rejects(() =>
    readData(
      scoped,
      registry,
      client,
      url("table=people&relatedTable=companies&relatedKey=beta"),
    ),
  );
  assert.equal(
    (await readData(scoped, registry, client, url("table=people&key=bob"))).rows
      .length,
    0,
  );
});
