import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, type Client } from "@libsql/client";
import { profileSchemaSql } from "../templates/lib/profiles/schema";
import { ledgerSchemaSql } from "../templates/lib/profiles/ledger";
import { migrateProfileLookups } from "../templates/lib/profiles/migrate";
import { applyEvidence, resolveIdentity, type Evidence } from "../templates/lib/profiles/store";
import { nextBatch, companiesOf, companyPopulation, progressCounts } from "../templates/lib/profiles/population";
import { guard, guardSchemaSql } from "../templates/lib/db-guard";

async function database() {
  const c = createClient({ url: ":memory:" });
  await c.executeMultiple(profileSchemaSql() + ledgerSchemaSql + guardSchemaSql);
  return c;
}
const strict = (c: Client) => guard(c, { mode: "strict", scope: "run:population" });
const source = (workflow: string, row: string) => ({
  workflow_id: workflow,
  source_id: "import",
  source_row_id: row,
  first_observed_at: "2026-09-01",
  last_observed_at: "2026-09-01",
});
const role = (n: number, status: "current" | "ended" = "current") => ({
  experience_key: `e${n}-${status}`,
  company_key: null,
  company_name: `Company ${n}`,
  title: "Role",
  start_date: null,
  end_date: null,
  current_status: status,
  current_status_evidence: null,
  company_linkedin_id: `c${n}`,
  company_linkedin_url: `https://www.linkedin.com/company/company-${n}`,
  company_domain: `company${n}.example`,
});
const evidence = (fields: Evidence["fields"], at: string): Evidence => ({
  provider: "fixture",
  endpoint: "profile",
  mode: "full",
  fetched_at: at,
  outcome: "success",
  raw: { at },
  fields,
  sections: { experiences_json: "complete" },
  cost_usd: 0,
});

/** What the side tables must hold: a pure function of the JSON columns. */
async function expected(c: Client) {
  const memberships: string[] = [];
  const employment: string[] = [];
  const aliases: string[] = [];
  for (const entity of ["people", "companies"] as const) {
    const rows = await c.execute(`SELECT key, sources_json, identifiers_json${entity === "people" ? ", experiences_json" : ""} FROM ${entity}`);
    for (const row of rows.rows) {
      for (const w of new Set((JSON.parse(String(row.sources_json ?? "[]")) as { workflow_id: string }[]).map((s) => s.workflow_id)))
        memberships.push(`${entity}|${w}|${row.key}`);
      for (const a of JSON.parse(String(row.identifiers_json ?? "[]")) as { namespace: string; value: string }[])
        aliases.push(`${entity}|${a.namespace}|${a.value}|${row.key}`);
      if (entity !== "people") continue;
      const current = new Map<string, number>();
      for (const e of JSON.parse(String(row.experiences_json ?? "[]")) as { company_key: string | null; current_status: string }[])
        if (e.company_key) current.set(e.company_key, Math.max(current.get(e.company_key) ?? 0, Number(e.current_status === "current")));
      for (const [company, isCurrent] of current) employment.push(`${row.key}|${company}|${isCurrent}`);
    }
  }
  return { memberships: memberships.sort(), employment: employment.sort(), aliases: [...new Set(aliases)].sort() };
}
async function actual(c: Client) {
  const list = async (sql: string) => (await c.execute(sql)).rows.map((r) => Object.values(r).join("|")).sort();
  return {
    memberships: await list("SELECT entity, workflow_id, entity_key FROM profile_memberships"),
    employment: await list("SELECT person_key, company_key, is_current FROM person_companies"),
    aliases: await list("SELECT entity, namespace, value, entity_key FROM profile_identifiers"),
  };
}

test("side tables stay exact through imports, evidence, merges, deletes and hand-written SQL", async () => {
  const c = await database();
  let seed = 7;
  const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const keys: string[] = [];
  for (let step = 0; step < 200; step++) {
    const n = random(24);
    const operation = random(6);
    if (operation <= 1) {
      const result = await resolveIdentity(c, "people", { linkedin_url: `https://www.linkedin.com/in/person-${n}` }, source(`w${random(3)}`, String(n)));
      if (result.status === "resolved") keys.push(result.profile.key);
    } else if (operation === 2 && keys.length) {
      const key = keys[random(keys.length)];
      const exists = await c.execute({ sql: "SELECT 1 FROM people WHERE key = ?", args: [key] });
      if (exists.rows.length)
        await applyEvidence(c, "people", key, evidence({ experiences_json: [role(random(5)), role(random(5), "ended")] }, `2026-09-02T00:00:${String(step % 60).padStart(2, "0")}Z`));
    } else if (operation === 3) {
      // Two company profiles for one company, later bridged by an id: a merge of duplicates.
      await resolveIdentity(c, "companies", { linkedin_url: `https://www.linkedin.com/company/company-${n % 5}` }, source("w0", `c${n}`));
      await resolveIdentity(c, "companies", { linkedin_company_id: `c${n % 5}`, linkedin_url: `https://www.linkedin.com/company/company-${n % 5}` });
    } else if (operation === 4 && keys.length) {
      // An older runtime, or a person at a SQL prompt, writing the JSON directly.
      await c.execute({ sql: "UPDATE people SET sources_json = ? WHERE key = ?", args: [JSON.stringify([source(`w${random(3)}`, "raw")]), keys[random(keys.length)]] });
    } else if (operation === 5 && keys.length) {
      await c.execute({ sql: "DELETE FROM people WHERE key = ?", args: [keys[random(keys.length)]] });
    }
  }
  const held = await actual(c);
  assert.ok(held.memberships.length > 5 && held.employment.length > 3, `the sequence must exercise the side tables: ${held.memberships.length} memberships, ${held.employment.length} employment`);
  assert.deepEqual(held, await expected(c));
});

test("the migration backfills rows written before the triggers existed, once, and is safe to run twice", async () => {
  const c = createClient({ url: ":memory:" });
  await c.executeMultiple(`CREATE TABLE people (key TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, sources_json TEXT, identifiers_json TEXT, experiences_json TEXT, primary_company_key TEXT, domain TEXT, name TEXT);
    CREATE TABLE companies (key TEXT PRIMARY KEY, created_at TEXT, updated_at TEXT, sources_json TEXT, identifiers_json TEXT, domain TEXT, name TEXT);
    INSERT INTO people (key, sources_json, identifiers_json, experiences_json) VALUES ('p1', '[{"workflow_id":"w"}]', '[{"namespace":"linkedin_url","value":"u"}]', '[{"company_key":"c1","current_status":"current"}]');
    INSERT INTO companies (key, sources_json) VALUES ('c1', 'not json');`);
  await migrateProfileLookups(c);
  assert.deepEqual(await actual(c), await expected({ execute: (sql: string) => c.execute(sql.replace("FROM companies", "FROM companies WHERE json_valid(sources_json)")) } as Client));
  const first = await c.execute("SELECT name, done_at FROM schema_backfills ORDER BY name");
  assert.deepEqual(first.rows.map((r) => r.name), ["person_companies_v1", "profile_identifiers_v1", "profile_memberships_v1"]);
  // A second build must not scan again: removing a side row shows whether the backfill re-ran.
  await c.execute("DELETE FROM person_companies");
  await migrateProfileLookups(c);
  assert.equal((await c.execute("SELECT COUNT(*) AS n FROM person_companies")).rows[0].n, 0);
  assert.deepEqual((await c.execute("SELECT name, done_at FROM schema_backfills ORDER BY name")).rows, first.rows);
});

async function seeded() {
  const c = await database();
  for (let i = 0; i < 7; i++) {
    const person = await resolveIdentity(c, "people", { linkedin_url: `https://www.linkedin.com/in/person-${i}` }, source(i < 5 ? "w" : "other", String(i)));
    assert.equal(person.status, "resolved");
    if (person.status === "resolved")
      await applyEvidence(c, "people", person.profile.key, evidence({ full_name: `Person ${i}`, experiences_json: [role(i % 2), role(9, "ended")] }, "2026-09-02T00:00:00Z"));
  }
  return c;
}

test("nextBatch pages a workflow's people by key with only the asked columns, as index searches", async () => {
  const c = await seeded();
  const db = strict(c);
  const first = await nextBatch(db, "w", "people", { limit: 3, columns: ["full_name"] });
  const second = await nextBatch(db, "w", "people", { after: first.after, limit: 3, columns: ["full_name"] });
  assert.equal(first.rows.length, 3);
  assert.equal(second.rows.length, 2);
  assert.equal(second.after, null);
  assert.deepEqual(Object.keys(first.rows[0]).sort(), ["full_name", "key"]);
  const keys = [...first.rows, ...second.rows].map((r) => String(r.key));
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, 5);
  await assert.rejects(nextBatch(db, "w", "people", { limit: 3, columns: ["raw_responses_json; DROP TABLE people"] }), /Unknown people field/);
});

test("companiesOf and companyPopulation read current companies through the relation, as index searches", async () => {
  const c = await seeded();
  const db = strict(c);
  const people = await nextBatch(db, "w", "people", { limit: 10, columns: ["full_name"] });
  const byPerson = await companiesOf(db, people.rows.map((r) => String(r.key)));
  assert.equal(byPerson.size, 5);
  for (const companies of byPerson.values()) assert.equal(companies.length, 1);
  const population = await companyPopulation(db, "w");
  assert.equal(population.length, 2);
  assert.deepEqual(population, [...new Set([...byPerson.values()].flat())].sort());
});

test("progressCounts reports total, done, remaining, succeeded and failed from indexes", async () => {
  const c = await seeded();
  await c.executeMultiple("CREATE TABLE qualified (key TEXT PRIMARY KEY, error TEXT, updated_at TEXT);");
  const db = strict(c);
  const people = await nextBatch(db, "w", "people", { limit: 10, columns: ["full_name"] });
  await c.execute({ sql: "INSERT INTO qualified VALUES (?, NULL, 'now'), (?, 'failed', 'now')", args: [people.rows[0].key, people.rows[1].key] });
  assert.deepEqual(await progressCounts(db, "w", "people", "qualified"), { total: 5, done: 2, remaining: 3, succeeded: 1, failed: 1 });
  assert.deepEqual(await progressCounts(db, "w", "current-companies", "qualified"), { total: 2, done: 0, remaining: 2, succeeded: 0, failed: 0 });
});
