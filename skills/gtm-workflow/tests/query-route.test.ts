// The agent's one door to the database, through the real route and the real driver. Each escape that once worked is a test.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import route from "../templates/server/api/query.post";
import { closeDb, db } from "../templates/lib/db";
import { resolveIdentity } from "../templates/lib/profiles/store";
import { testDatabase } from "./db";

const SECRET = "query-route-test";
let database: Awaited<ReturnType<typeof testDatabase>>;
before(async () => {
  process.env.GTM_RUN_SECRET = SECRET;
  database = await testDatabase();
  await database.query("CREATE TABLE public.query_route_victim (n integer)");
  await database.query("INSERT INTO gtm.people (key, created_at, updated_at, full_name) VALUES ('p1', now(), now(), 'Ada')");
});
after(closeDb);

async function ask(sql: string, args?: unknown[], bearer = SECRET) {
  const response = await (route as unknown as (event: unknown) => Promise<unknown>)({
    req: new Request("http://localhost/api/query", { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" }, body: JSON.stringify({ sql, args }) }),
    context: {},
  });
  return response instanceof Response ? { status: response.status, text: await response.text() } : { status: 200, body: response as { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean } };
}
const victims = async () => (await database.query("SELECT count(*)::int AS n FROM public.query_route_victim")).rows[0].n;

test("reads with $1 parameters, runtime tables by plain or qualified name, and the 1,000-row cap", async () => {
  assert.equal((await ask("select 1", [], "wrong")).status, 401);
  const sum = await ask("select $1::int + 1 as n", [41]);
  assert.deepEqual(sum.body, { columns: ["n"], rows: [{ n: 42 }], truncated: false });
  for (const name of ["people", "gtm.people"]) assert.deepEqual((await ask(`select full_name from ${name} where key = $1`, ["p1"])).body?.rows, [{ full_name: "Ada" }]);
  // count(*) is a bigint and arrives as text unless cast; times arrive as ISO text.
  const typed = (await ask("select count(*) as plain, count(*)::int as cast, max(created_at) as at from gtm.people")).body!.rows[0];
  assert.equal(typed.plain, "1"); assert.equal(typed.cast, 1); assert.match(JSON.parse(JSON.stringify(typed.at)), /^\d{4}-\d\d-\d\dT/);
  const many = await ask("select generate_series(1, 1500) as n");
  assert.equal(many.body?.rows.length, 1000); assert.equal(many.body?.truncated, true);
  assert.equal((await ask("   ")).status, 400);
});

test("every way to write is refused by Postgres, and nothing was written", async () => {
  for (const [why, sql, args] of [
    ["a plain write", "insert into query_route_victim values (1)"],
    ["a write inside a CTE", "with w as (insert into query_route_victim values (2) returning n) select * from w"],
    ["switching read-only off, then writing", "with s as (select set_config('transaction_read_only', 'off', true)) insert into query_route_victim select 3 from s"],
    ["a second statement after commit, sent with no parameters", "select 1; commit; insert into query_route_victim values (4)", []],
    ["a DO block that switches read-only off", "do $$ begin perform set_config('transaction_read_only', 'off', true); insert into query_route_victim values (5); end $$"],
    ["a DO block that commits", "do $$ begin commit; insert into query_route_victim values (6); end $$"],
    ["ddl", "create table public.query_route_made (n integer)"],
  ] as [string, string, unknown[]?][]) {
    const result = await ask(sql, args);
    assert.equal(result.status, 400, why);
    assert.match(result.text!, /^The statement was refused: /, why);
  }
  assert.equal(await victims(), 0);
});

test("the server's files and programs stay out of reach", async () => {
  // Locally the app's role is not a superuser. On Neon this records what the integration's role may do: a failure here is a finding to report.
  for (const sql of ["COPY (select 1) TO PROGRAM 'true'", "select pg_read_file('postgresql.conf')"]) assert.equal((await ask(sql)).status, 400, sql);
});

test("a session lock taken through the route does not block a profile write", async () => {
  assert.equal((await ask("select pg_advisory_lock(7461)")).status, 200);
  const started = Date.now();
  const resolved = await resolveIdentity(db(), "people", { linkedin_url: "linkedin.com/in/after-the-lock" });
  assert.equal(resolved.status, "resolved");
  assert.ok(Date.now() - started < 10_000, "the write waited on a lock the route should have released");
});

test("a statement is cancelled at five seconds", async () => {
  const started = Date.now();
  const result = await ask("select pg_sleep(10)");
  assert.equal(result.status, 400);
  assert.match(result.text!, /statement timeout/);
  assert.ok(Date.now() - started < 8_000);
});
