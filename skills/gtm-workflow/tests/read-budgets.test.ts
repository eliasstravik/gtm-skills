// The guardrail on bytes out of Postgres: every read path of the runtime, measured on a fixture network and held to the
// budgets in templates/lib/read-budgets.ts. A `select *` that slips back into a hot path fails here, not on the Neon bill.
// Bytes are counted on the client at the socket (readBytes in lib/db.ts): what Neon bills as data transfer.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db as appDatabase, closeDb, readBytes, resetReadBytes } from "../templates/lib/db";
import { READ_BUDGETS } from "../templates/lib/read-budgets";
import { testDatabase } from "./db";
import { prepareNetwork, enrichItems, collectCompanies } from "../templates/lib/profiles/network";
import { finishRun, runSummary } from "../templates/lib/profiles/ledger";
import { readCounts, readData } from "../templates/lib/data-api";
import { profileView } from "../templates/lib/profiles/view";
import { dataVersion } from "../templates/lib/viewer-pulse";
import { people, companies } from "../templates/lib/schema/profiles";
import queryRoute from "../templates/server/api/query.post";
import { networkFixture } from "./network-fixture";

after(closeDb);
const PEOPLE = 120;
const WORKFLOW = "workflow-budgets";
const fixture = networkFixture(PEOPLE);

/** Runs one read path with the meter reset, and reports its bytes with the heaviest statement shapes when over budget. */
async function measure<T>(label: string, budget: number, per: number, fn: () => Promise<T>): Promise<T> {
  resetReadBytes();
  const result = await fn();
  const { total, shapes } = readBytes();
  const each = total / per;
  const detail = shapes.slice(0, 5).map((s) => `\n    ${Math.round(s.bytes / per)} bytes over ${s.statements} statements: ${s.shape}`).join("");
  console.log(`  ${label}: ${Math.round(each)} bytes (budget ${budget})${detail}`);
  assert.ok(each <= budget, `${label} reads ${Math.round(each)} bytes, over the budget of ${budget} in lib/read-budgets.ts; the heaviest statements:${detail}`);
  return result;
}

test("every read path stays within its byte budget", async () => {
  await testDatabase();
  const client = appDatabase();
  const restore = fixture.stubBlitz();
  try {
    const input = { provider: "blitz" as const, rows: fixture.rows, maxPeople: PEOPLE, maxSpendUsd: 1, requestsPerSecond: 100_000 };
    const prepared = await prepareNetwork(client, WORKFLOW, "budgets", input);
    if (prepared.status !== "running") throw new Error(prepared.status);
    // A person's cost is the people phase plus the company collection that follows it; twelve workers, as a hosted chunk runs.
    resetReadBytes();
    await enrichItems(client, prepared.lease, "people", prepared.people, input, "key", { workers: 12 });
    const collected = await collectCompanies(client, prepared.lease, prepared.people);
    const perPerson = readBytes().total / PEOPLE;
    console.log(`  enriched person: ${Math.round(perPerson)} bytes (budget ${READ_BUDGETS.enrichedPerson})`);
    assert.ok(perPerson <= READ_BUDGETS.enrichedPerson, `an enriched person reads ${Math.round(perPerson)} bytes, over ${READ_BUDGETS.enrichedPerson}; the heaviest statements:${readBytes().shapes.slice(0, 5).map((s) => `\n    ${Math.round(s.bytes / PEOPLE)} bytes over ${s.statements} statements: ${s.shape}`).join("")}`);
    assert.equal(collected.keys.length, fixture.companies);
    await measure("enriched company", READ_BUDGETS.enrichedCompany, fixture.companies, () => enrichItems(client, prepared.lease, "companies", collected.keys, input, "key", { workers: 12 }));
    await finishRun(client, prepared.lease);
    const summary = await runSummary(client, prepared.lease.id);
    assert.equal(summary.state, "complete");
    assert.equal(summary.outcomes.find((o) => o.phase === "people" && o.state === "done")?.count, PEOPLE);

    // The viewer's reads over the same data, one call each, as the profile view registers them.
    const view = profileView(WORKFLOW).data;
    const registry = { people, companies };
    const page = (params: string) => new URL(`http://viewer/api/viewer?v=3&op=data&${params}`);
    const list = await measure("viewer list call, people with the default columns", READ_BUDGETS.dataApiList, 1, () => readData(view, registry, client, page("table=people")));
    assert.equal(list.rows.length, 25);
    await measure("listed row, people with the default columns", READ_BUDGETS.listedRow, 25, () => readData(view, registry, client, page("table=people")));
    await measure("viewer list call, companies with the default columns", READ_BUDGETS.dataApiList, 1, () => readData(view, registry, client, page("table=companies")));
    const personKey = prepared.people[0].personKey!;
    await measure("viewer single record", READ_BUDGETS.dataApiRecord, 1, () => readData(view, registry, client, page(`table=people&key=${personKey}`)));
    await measure("viewer related companies of one person", READ_BUDGETS.dataApiList, 1, () => readData(view, registry, client, page(`table=companies&relatedTable=people&relatedKey=${personKey}`)));
    await measure("viewer counts", READ_BUDGETS.dataApiList, 1, () => readCounts(view, registry, client));
    // The pulse every open viewer tab sends every few seconds: its only database read.
    await measure("viewer pulse", READ_BUDGETS.viewerPulse, 1, () => dataVersion(client));
    // The record's own metadata never rides on a list, however asked.
    for (const column of ["responses_json", "provenance_json", "section_status_json", "sources_json"]) {
      await assert.rejects(readData(view, registry, client, page(`table=people&columns=full_name,${column}`)), /single record only/);
      assert.ok(!list.availableFields!.some((f) => f.id === column), `${column} offered for a list`);
    }

    // The query route: an unbounded statement leaves the database within the route's caps, whatever it says.
    process.env.GTM_RUN_SECRET = "budgets";
    const ask = async (sql: string) => {
      const response = await (queryRoute as unknown as (event: unknown) => Promise<unknown>)({
        req: new Request("http://localhost/api/query", { method: "POST", headers: { authorization: "Bearer budgets", "content-type": "application/json" }, body: JSON.stringify({ sql, args: [] }) }),
        context: {},
      });
      if (response instanceof Response) throw new Error(await response.text());
      return response as { rows: unknown[]; truncated: boolean };
    };
    // Fixture people are small, so this run hits the row cap; the wide read below hits the byte cap. One fetch may run past a cap by a row.
    const rows = await measure("query route, select key from gtm.people", READ_BUDGETS.queryRouteBytes, 1, () => ask("select key from gtm.people, generate_series(1, 20)"));
    assert.equal(rows.rows.length, READ_BUDGETS.queryRouteRows);
    assert.equal(rows.truncated, true);
    const wide = await measure("query route, select * from gtm.people cross join a series", READ_BUDGETS.queryRouteBytes * 1.05, 1, () => ask("select p.*, s.n from gtm.people p, generate_series(1, 200) s(n)"));
    assert.ok(wide.rows.length < READ_BUDGETS.queryRouteRows, "the byte cap stopped the read before the row cap");
    assert.equal(wide.truncated, true);
    const whole = await ask("select key from gtm.people");
    assert.equal(whole.rows.length, PEOPLE);
    assert.equal(whole.truncated, false);
  } finally {
    restore();
  }
});
