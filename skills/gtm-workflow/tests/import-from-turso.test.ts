// The move of a workspace's data from its previous SQLite/Turso database into Postgres, on a fixture built from the
// old schema as text, PR #119's drift included, with hand-written rows in the shapes SQLite stored.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runImport } from "../scripts/import-from-turso.mjs";
import { closeDb, db } from "../templates/lib/db";
import { resolveIdentity } from "../templates/lib/profiles/store";
import { testDatabase } from "./db";

const skill = join(process.env.GTM_TEST_RUNTIME!, "..");
const folder = mkdtempSync(join(tmpdir(), "gtm-import-"));
after(async () => { await closeDb(); rmSync(folder, { recursive: true, force: true }); });

function fixture(name: string, extra = "") {
  const file = join(folder, name), source = new DatabaseSync(file);
  source.exec(readFileSync(join(skill, "tests/fixtures/import-source-schema.sql"), "utf8"));
  source.exec(`
    ALTER TABLE people ADD COLUMN legacy_note TEXT;
    CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY, hash TEXT);
    INSERT INTO "__drizzle_migrations" VALUES (1, 'abc');
    INSERT INTO people (key, created_at, updated_at, enriched_at, full_name, linkedin_url, linkedin_profile_id, is_premium, is_hiring, followers_count, cost_usd, identifiers_json, sources_json, experiences_json, raw_responses_json, legacy_note) VALUES
      ('p1', '2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.123Z', '2026-09-02T10:00:00Z', 'Ada Example', 'https://www.linkedin.com/in/ada', 'ACoAA-ada', 1, 0, 1200, 0.05,
       '[{"namespace":"linkedin_url","value":"https://www.linkedin.com/in/ada","observed_at":"2026-09-01T10:00:00.000Z"},{"namespace":"linkedin_profile_id","value":"ACoAA-ada","observed_at":"2026-09-02T10:00:00Z"},{"namespace":"internal_key","value":"p0-merged","observed_at":"2026-09-02T10:00:00Z"}]',
       '[{"workflow_id":"w1","source_id":"import","source_row_id":"1","first_observed_at":"2026-09-01","last_observed_at":"2026-09-01"}]',
       '[{"experience_key":"e1","company_key":"c1","company_name":"Acme","title":"Founder","start_date":null,"end_date":null,"current_status":"current","current_status_evidence":null}]',
       '{"ref":{"provider":"fixture","number":1.0,"nested":[1,2,{"a":null}]}}', 'kept only in the old database'),
      ('p2', '2026-09-03', '2026-09-03', NULL, 'Grace Example', 'https://www.linkedin.com/in/grace', NULL, NULL, NULL, NULL, NULL,
       '[{"namespace":"linkedin_url","value":"https://www.linkedin.com/in/grace","observed_at":"2026-09-03"},{"namespace":"linkedin_url","value":"https://www.linkedin.com/in/ada","observed_at":"2026-09-03"}]',
       '[]', NULL, NULL, NULL);
    INSERT INTO companies (key, created_at, updated_at, name, domain, linkedin_company_id, is_verified, founded_year, industries_json, identifiers_json) VALUES
      ('c1', '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z', 'Acme', 'acme.example', '4242', 1, 2015, '["Software"]', '[{"namespace":"linkedin_company_id","value":"4242","observed_at":"2026-09-01T10:00:00Z"}]');
    INSERT INTO profile_identifiers VALUES ('people', 'linkedin_url', 'https://www.linkedin.com/in/stale-and-wrong', 'p2');
    INSERT INTO cache VALUES ('homepage', 'live', '{"text":"hello"}', '2026-09-01T00:00:00Z', '2999-01-01T00:00:00.000Z'), ('homepage', 'text', '"plain text"', '2026-09-01T00:00:00Z', '2999-01-01T00:00:00.000Z'), ('homepage', 'expired', '{"old":true}', '2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z');
    INSERT INTO example_scores VALUES ('acme.example', '2026-09-10T08:00:00.000Z', 0.01, NULL, 88, 'fits'), ('beta.example', '2026-09-10T08:00:01.000Z', 0.01, '{"layer":"step"}', NULL, NULL);
    INSERT INTO profile_runs (id, workflow_id, owner, lease_until, state, budget_micro, spent_micro, reserved_micro, input_json, companies_json, omitted, created_at) VALUES ('run1', 'w1', 'run1', 1789900000000, 'complete', 20000000, 50000, 0, '[{"key":"p1"}]', '["c1"]', 0, '2026-09-02T10:00:00Z');
    INSERT INTO profile_work VALUES ('run1', 'people', 'p1', 'done');
    INSERT INTO profile_attempts VALUES ('a1', 'run1', 'p1', 'clay:/enrichment/person:default', 'settled', 100000, 50000, 'job-1', '{"status":"COMPLETED"}', '2026-09-02T10:00:00Z');
    INSERT INTO profile_inputs VALUES ('w1', 'import', '1', '{"key":"in1"}', 'p1', '2026-09-01', '2026-09-01');
    INSERT INTO gtm_viewer_grants VALUES ('g1', 'hash1', 'w1', 'workspace', 'production', '["logic","data"]', 'policyhash', 1789900000123, NULL, NULL, 'cipher');
    ${extra}`);
  source.close();
  return file;
}
const quiet = () => {};

test("the diff comes first and writes nothing, even against a target that holds rows", async () => {
  const database = await testDatabase();
  await database.query("INSERT INTO example_scores (key, updated_at) VALUES ('already-here', now())");
  const lines: string[] = [];
  const report = await runImport({ source: fixture("diff.db"), targetUrl: database.unpooled, diffOnly: true, log: (line: string) => lines.push(line) });
  assert.equal(report.passed, false);
  assert.deepEqual(JSON.parse(lines[0]).rows.people, 2);
  assert.deepEqual(report.problems, []);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 0);
  // Anything but an empty target is refused, and nothing is written.
  await assert.rejects(runImport({ source: fixture("refused.db"), targetUrl: database.unpooled, log: quiet }), /already holds rows/);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 0);
});

test("every row arrives with its real type, drift is reported, and the store finds the imported records", async () => {
  const database = await testDatabase();
  const reportPath = join(folder, "import-report.json");
  const report = await runImport({ source: fixture("full.db"), targetUrl: database.unpooled, reportPath, log: quiet });
  assert.equal(report.passed, true);
  assert.deepEqual(JSON.parse(readFileSync(reportPath, "utf8")).passed, true);
  assert.equal(report.target.host, new URL(database.unpooled).host);
  assert.ok(!readFileSync(reportPath, "utf8").includes("gtm:gtm"), "the report names the host, never the URL");
  for (const [name, table] of Object.entries(report.tables) as [string, any][]) {
    if (table.derived) continue;
    assert.deepEqual([table.missing_in_target, table.missing_in_source, table.different], [[], [], []], name);
  }
  assert.equal(report.tables.people.target_count, 2);
  assert.equal(report.tables.cache.target_count, 2);
  assert.equal(report.skipped_cache_rows, 1);
  // PR #119's table is reported and skipped, its stale row never imported; the old migration journal is not in the target.
  assert.deepEqual(report.skipped_tables.map((t: any) => [t.table, t.rows]).sort(), [["__drizzle_migrations", 1], ["profile_identifiers", 1]]);
  assert.deepEqual(report.skipped_columns.map((c: any) => `${c.table}.${c.column}`), ["people.legacy_note"]);
  assert.deepEqual(report.consumed_columns.map((c: any) => `${c.table}.${c.column}`).sort(), ["companies.identifiers_json", "people.identifiers_json"]);
  assert.deepEqual(report.identifier_conflicts, [{ entity: "people", namespace: "linkedin_url", value: "https://www.linkedin.com/in/ada", owner: "p1", also_claimed_by: "p2" }]);
  const identifiers = (await database.query("SELECT entity || ':' || namespace || '=' || value || '>' || key AS id FROM gtm.profile_identifiers ORDER BY 1")).rows.map((row) => row.id);
  assert.deepEqual(identifiers, [
    "companies:linkedin_company_id=4242>c1",
    "people:internal_key=p0-merged>p1",
    "people:linkedin_profile_id=ACoAA-ada>p1",
    "people:linkedin_url=https://www.linkedin.com/in/ada>p1",
    "people:linkedin_url=https://www.linkedin.com/in/grace>p2",
  ]);
  const [ada] = (await database.query("SELECT pg_typeof(updated_at)::text AS time_type, updated_at, is_premium, is_hiring, followers_count, pg_typeof(raw_responses_json)::text AS json_type, raw_responses_json, sources_json FROM gtm.people WHERE key = 'p1'")).rows;
  assert.deepEqual([ada.time_type, ada.json_type, ada.is_premium, ada.is_hiring, ada.followers_count], ["timestamp with time zone", "jsonb", true, false, 1200]);
  assert.equal(ada.updated_at.toISOString(), "2026-09-02T10:00:00.123Z");
  assert.deepEqual(ada.raw_responses_json, { ref: { provider: "fixture", number: 1, nested: [1, 2, { a: null }] } });
  const [grant] = (await database.query("SELECT created_at, views FROM gtm.gtm_viewer_grants")).rows;
  assert.equal(grant.created_at.getTime(), 1789900000123, "epoch milliseconds become a time");
  assert.deepEqual(grant.views, ["logic", "data"]);
  assert.deepEqual((await database.query("SELECT value FROM gtm.cache WHERE hash = 'text'")).rows[0].value, "plain text");
  const [run] = (await database.query("SELECT lease_until, budget_micro, input_json FROM gtm.profile_runs")).rows;
  assert.deepEqual([run.lease_until.getTime(), Number(run.budget_micro), run.input_json], [1789900000000, 20000000, [{ key: "p1" }]]);

  // Through the real store: imported identifiers find the imported records and create nothing.
  const person = await resolveIdentity(db(), "people", { linkedin_profile_id: "ACoAA-ada" });
  const company = await resolveIdentity(db(), "companies", { linkedin_company_id: "4242" });
  assert.deepEqual([person.status === "resolved" && person.profile.key, company.status === "resolved" && company.profile.key], ["p1", "c1"]);
  assert.deepEqual((await database.query("SELECT (SELECT count(*)::int FROM gtm.people) AS people, (SELECT count(*)::int FROM gtm.companies) AS companies")).rows[0], { people: 2, companies: 1 });
});

test("bad values and workspace drift stop the run before anything is written", async () => {
  const database = await testDatabase();
  const bad = fixture("bad.db", `
    UPDATE people SET sources_json = '{not json' WHERE key = 'p2';
    UPDATE companies SET name = 'Ac' || char(0) || 'me';
    ALTER TABLE example_scores ADD COLUMN invented TEXT;`);
  await assert.rejects(runImport({ source: bad, targetUrl: database.unpooled, log: quiet }), (error: Error) => {
    assert.match(error.message, /Nothing was written/);
    assert.match(error.message, /people \["p2"\]: sources_json is not valid JSON/);
    assert.match(error.message, /companies \["c1"\]: name holds a NUL character/);
    assert.match(error.message, /Workspace table example_scores has a column invented/);
    return true;
  });
  assert.equal((await database.query("SELECT (SELECT count(*)::int FROM gtm.people) + (SELECT count(*)::int FROM example_scores) AS n")).rows[0].n, 0);
  // Asked to, the import removes the character Postgres cannot hold, from the whole value and not only up to it.
  const nul = fixture("nul.db", `UPDATE companies SET name = 'Ac' || char(0) || 'me', description = 'a \\u0000 in plain text is only text', industries_json = '["x\\u0000y"]';`);
  await assert.rejects(runImport({ source: nul, targetUrl: database.unpooled, log: quiet }), /name holds a NUL character/);
  const stripped = await runImport({ source: nul, targetUrl: database.unpooled, stripNul: true, log: quiet });
  assert.equal(stripped.passed, true);
  // The data was changed on the way in, so the report says where and how much.
  assert.deepEqual(stripped.stripped_nul_cells, { companies: 2 });
  assert.equal(stripped.tables.companies.stripped_nul_cells, 2);
  assert.equal(stripped.tables.people.stripped_nul_cells, 0);
  assert.deepEqual((await database.query("SELECT name, description, industries_json FROM gtm.companies")).rows[0], { name: "Acme", description: "a \\u0000 in plain text is only text", industries_json: ["xy"] });
});

test("a wide workspace table stays under Postgres' 65,535 parameters per statement", async () => {
  const database = await testDatabase();
  const columns = Array.from({ length: 150 }, (_, i) => `c${i}`);
  await database.query(`CREATE TABLE public.wide (key text PRIMARY KEY, ${columns.map((c) => `${c} text`).join(", ")})`);
  const source = fixture("wide.db", `CREATE TABLE wide (key TEXT PRIMARY KEY, ${columns.map((c) => `${c} TEXT`).join(", ")});
    WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 600) INSERT INTO wide (key, c0, c149) SELECT 'k' || x, 'first ' || x, 'last ' || x FROM n;`);
  // 500 rows of 151 columns would be 75,500 parameters in one statement.
  const report = await runImport({ source, targetUrl: database.unpooled, log: quiet });
  assert.equal(report.passed, true);
  assert.equal(report.tables.wide.target_count, 600);
});

test("the command line takes its target from its own variable and needs the host typed out", () => {
  const script = join(skill, "scripts/import-from-turso.mjs"), source = fixture("cli.db");
  const run = (args: string[], env: Record<string, string>) => spawnSync(process.execPath, [script, source, ...args], { encoding: "utf8", env: { PATH: process.env.PATH ?? "", SystemRoot: process.env.SystemRoot ?? "", ...env } });
  const ignored = run([], { DATABASE_URL: "postgres://nobody:nothing@remote.invalid/db" });
  assert.notEqual(ignored.status, 0);
  assert.match(ignored.stderr, /Set IMPORT_TARGET_URL/);
  const unconfirmed = run(["--confirm-host", "elsewhere.invalid"], { IMPORT_TARGET_URL: "postgres://nobody:nothing@remote.invalid/db" });
  assert.notEqual(unconfirmed.status, 0);
  assert.match(unconfirmed.stderr, /--confirm-host must equal the host/);
  assert.doesNotMatch(unconfirmed.stdout + unconfirmed.stderr, /nobody:nothing/);
});
