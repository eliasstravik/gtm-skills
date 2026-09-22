// Throughput and bytes out of the write path: a network enrichment of fixture people and their companies through a
// stubbed provider against the test Postgres. Prints items per second, transactions per item and bytes received from
// Postgres per item with 12 workers and with 1, then the bytes of each viewer and data-API read path over the same
// data. GTM_BENCH_PEOPLE sets the list size (500 by default); the fixture keeps five people per company.
// GTM_BENCH_LATENCY_MS adds network latency to every round trip, to see the run as Neon would.
//
// Bytes are counted on the client at the socket, after TLS, attributed to the statement the connection was running
// (readBytes in lib/db.ts): the bytes Neon bills as data transfer, protocol framing included.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db as appDatabase, closeDb, readBytes, resetReadBytes } from "../templates/lib/db";
import { testDatabase } from "./db";
import { prepareNetwork, beginItem, acceptItem, collectCompanies, type NetworkPerson } from "../templates/lib/profiles/network";
import { finishRun, runSummary } from "../templates/lib/profiles/ledger";
import { readCounts, readData } from "../templates/lib/data-api";
import { profileView } from "../templates/lib/profiles/view";
import { people, companies } from "../templates/lib/schema/profiles";
import queryRoute from "../templates/server/api/query.post";
import { networkFixture } from "./network-fixture";

after(closeDb);
const PEOPLE = Number(process.env.GTM_BENCH_PEOPLE) || 500;
const WORKFLOW = "workflow-bench";
const fixture = networkFixture(PEOPLE);

/** Transactions committed or rolled back on this database, read after the pool has closed so every backend has flushed its counters. */
async function transactions(database: Awaited<ReturnType<typeof testDatabase>>) {
  const { rows } = await database.query<{ n: string }>("SELECT (xact_commit + xact_rollback)::text AS n FROM pg_stat_database WHERE datname = current_database()");
  return Number(rows[0].n);
}

/**
 * Every query the app's pool sends is one round trip to the database: on Neon each costs a millisecond or two, which
 * GTM_BENCH_LATENCY_MS adds to every query here to show the hosted shape of the run (0 by default).
 */
let roundTrips = 0;
const LATENCY_MS = Number(process.env.GTM_BENCH_LATENCY_MS) || 0;
const originalQuery = pg.Client.prototype.query;
(pg.Client.prototype as any).query = function (this: pg.Client, ...args: unknown[]) {
  roundTrips += 1;
  if (!LATENCY_MS) return (originalQuery as any).apply(this, args);
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS)).then(() => (originalQuery as any).apply(this, args));
};

type Phase = { items: number; seconds: number; transactions: number; roundTrips: number; cpuSeconds: number; bytes: number };
const perSecond = (p: Phase) => (p.items / p.seconds).toFixed(1);
/** Node CPU time of this process over the phase: when it approaches the wall time, the one event loop is the limit, not the database. */
const perItem = (p: Phase) =>
  `${(p.transactions / p.items).toFixed(2)} tx/item, ${(p.roundTrips / p.items).toFixed(1)} round trips/item, ${((p.cpuSeconds / p.items) * 1000).toFixed(1)} ms node CPU/item, ${Math.round(p.bytes / p.items)} bytes/item`;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/** The statement shapes that received the most bytes since the last reset, as one line each. */
function heaviest(count = 6) {
  return readBytes()
    .shapes.slice(0, count)
    .map((s) => `    ${kb(s.bytes)} over ${s.statements} statements: ${s.shape}`)
    .join("\n");
}

async function run(workers: number) {
  const database = await testDatabase();
  const db = appDatabase();
  const restore = fixture.stubBlitz();
  try {
    const input = { provider: "blitz" as const, rows: fixture.rows, maxPeople: PEOPLE, maxSpendUsd: 1, requestsPerSecond: 100_000 };
    const prepared = await prepareNetwork(db, WORKFLOW, `bench-${workers}`, input);
    if (prepared.status !== "running") throw new Error(prepared.status);
    const phase = async (kind: "people" | "companies", items: (NetworkPerson | string)[]): Promise<Phase> => {
      await closeDb();
      const before = await transactions(database);
      const client = appDatabase();
      const trips = roundTrips;
      resetReadBytes();
      const cpu = process.cpuUsage();
      const started = Date.now();
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          const item = items[next++];
          const initial = await beginItem(client, prepared.lease, kind, item, input, "key");
          if (initial.state === "ready") await acceptItem(client, prepared.lease, kind, item, initial, input);
        }
      };
      await Promise.all(Array.from({ length: Math.min(workers, items.length) }, worker));
      const seconds = (Date.now() - started) / 1000;
      const used = process.cpuUsage(cpu);
      const sent = roundTrips - trips;
      const bytes = readBytes().total;
      console.log(`  ${kind} phase, heaviest statement shapes:\n${heaviest()}`);
      await closeDb();
      return { items: items.length, seconds, transactions: (await transactions(database)) - before, roundTrips: sent, cpuSeconds: (used.user + used.system) / 1e6, bytes };
    };
    const peoplePhase = await phase("people", prepared.people);
    resetReadBytes();
    const collected = await collectCompanies(appDatabase(), prepared.lease, prepared.people);
    const collectBytes = readBytes().total;
    assert.equal(collected.keys.length, fixture.companies);
    const companiesPhase = await phase("companies", collected.keys);
    await finishRun(appDatabase(), prepared.lease);
    const summary = await runSummary(appDatabase(), prepared.lease.id);
    assert.equal(summary.state, "complete");
    assert.equal(summary.outcomes.find((o) => o.phase === "people" && o.state === "done")?.count, PEOPLE);
    assert.equal(summary.outcomes.find((o) => o.phase === "companies" && o.state === "done")?.count, fixture.companies);
    const all: Phase = {
      items: peoplePhase.items + companiesPhase.items,
      seconds: peoplePhase.seconds + companiesPhase.seconds,
      transactions: peoplePhase.transactions + companiesPhase.transactions,
      roundTrips: peoplePhase.roundTrips + companiesPhase.roundTrips,
      cpuSeconds: peoplePhase.cpuSeconds + companiesPhase.cpuSeconds,
      bytes: peoplePhase.bytes + companiesPhase.bytes + collectBytes,
    };
    console.log(
      `bench-network workers=${workers}: people ${peoplePhase.items} in ${peoplePhase.seconds.toFixed(1)}s (${perSecond(peoplePhase)}/s, ${perItem(peoplePhase)}); ` +
        `company collection ${Math.round(collectBytes / PEOPLE)} bytes/person; ` +
        `companies ${companiesPhase.items} in ${companiesPhase.seconds.toFixed(1)}s (${perSecond(companiesPhase)}/s, ${perItem(companiesPhase)}); ` +
        `all ${all.items} in ${all.seconds.toFixed(1)}s (${perSecond(all)}/s, ${perItem(all)}); ` +
        `whole run ${kb(all.bytes)}, ${Math.round(all.bytes / PEOPLE)} bytes per person in the list`,
    );
    if (workers === 12) await readPaths(prepared.people[0].personKey!);
  } finally {
    restore();
  }
}

/** One call of each read path over the enriched data, in bytes received from Postgres. */
async function readPaths(personKey: string) {
  const view = profileView(WORKFLOW).data;
  const registry = { people, companies };
  const client = appDatabase();
  const measure = async <T,>(label: string, fn: () => Promise<T>, rows?: number) => {
    resetReadBytes();
    const result = await fn();
    const { total } = readBytes();
    console.log(`  ${label}: ${kb(total)}${rows ? `, ${Math.round(total / rows)} bytes/row` : ""}`);
    return result;
  };
  const page = (params: string) => new URL(`http://viewer/api/viewer?v=3&op=data&${params}`);
  const list = await measure("viewer people list page (default columns)", () => readData(view, registry, client, page("table=people")));
  console.log(`    ${list.rows.length} rows, ${Math.round(readBytes().total / list.rows.length)} bytes per listed row`);
  const companyList = await measure("viewer companies list page (default columns)", () => readData(view, registry, client, page("table=companies")));
  console.log(`    ${companyList.rows.length} rows, ${Math.round(readBytes().total / companyList.rows.length)} bytes per listed row`);
  await measure("viewer people list page (every column the API allows)", () => readData(view, registry, client, page(`table=people&columns=${list.availableFields!.map((f) => f.id).join(",")}`)));
  await measure("viewer single person record", () => readData(view, registry, client, page(`table=people&key=${personKey}`)));
  await measure("viewer related companies of one person", () => readData(view, registry, client, page(`table=companies&relatedTable=people&relatedKey=${personKey}`)));
  await measure("viewer counts", () => readCounts(view, registry, client));
  process.env.GTM_RUN_SECRET = "bench";
  const ask = async (sql: string) => {
    const response = await (queryRoute as unknown as (event: unknown) => Promise<unknown>)({
      req: new Request("http://localhost/api/query", { method: "POST", headers: { authorization: "Bearer bench", "content-type": "application/json" }, body: JSON.stringify({ sql, args: [] }) }),
      context: {},
    });
    if (response instanceof Response) throw new Error(await response.text());
    return response as { rows: unknown[]; truncated: boolean };
  };
  const wide = await measure("query route: select * from gtm.people (an agent's unbounded read)", () => ask("select * from gtm.people"));
  console.log(`    ${wide.rows.length} rows returned, truncated ${wide.truncated}`);
  await measure("query route: select key, full_name, headline from gtm.people limit 50", () => ask("select key, full_name, headline from gtm.people limit 50"));
  await measure("query route: count(*) of gtm.people", () => ask("select count(*)::int from gtm.people"));
}

test(`network enrichment of ${PEOPLE} people with 12 workers`, () => run(12));
test(`network enrichment of ${PEOPLE} people with 1 worker`, () => run(1));
