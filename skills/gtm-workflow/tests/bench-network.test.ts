// Throughput of the write path: a network enrichment of fixture people and their companies through a stubbed provider
// against the test Postgres. Prints items per second and transactions per item with 12 workers and with 1.
// GTM_BENCH_PEOPLE sets the list size (500 by default); the fixture keeps five people per company.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { db as appDatabase, closeDb } from "../templates/lib/db";
import { testDatabase } from "./db";
import { prepareNetwork, beginItem, acceptItem, collectCompanies, type NetworkPerson } from "../templates/lib/profiles/network";
import { finishRun, runSummary } from "../templates/lib/profiles/ledger";
import { blitzPerson, blitzCompany } from "./blitz-fixtures";

after(closeDb);
const PEOPLE = Number(process.env.GTM_BENCH_PEOPLE) || 500;
const PER_COMPANY = 5;
const COMPANIES = Math.ceil(PEOPLE / PER_COMPANY);

const companyOf = (n: number) => ({
  name: `Company ${n}`,
  domain: `company-${n}.example`,
  linkedin_id: String(1_000_000 + n),
  linkedin_url: `https://www.linkedin.com/company/company-${n}`,
});
/** Person i works at company i mod C now and left company (i + 7) mod C, so ended roles also resolve companies. */
function person(url: string) {
  const i = Number(url.split("/p").pop());
  const now = companyOf(i % COMPANIES), before = companyOf((i + 7) % COMPANIES);
  const role = (c: ReturnType<typeof companyOf>, current: boolean, title: string) => ({
    ...blitzPerson.person.experiences[0],
    job_title: title,
    company_name: c.name,
    company_domain: c.domain,
    company_linkedin_id: c.linkedin_id,
    company_linkedin_url: c.linkedin_url,
    job_start_date: current ? "2023-01-01" : "2019-01-01",
    job_end_date: current ? null : "2022-12-01",
    job_is_current: current,
  });
  return {
    ...blitzPerson,
    person: {
      ...blitzPerson.person,
      full_name: `Person ${i}`,
      first_name: "Person",
      last_name: String(i),
      linkedin_url: url,
      linkedin_id: `ACoAA${i}`,
      experiences: [role(now, true, "Head of Growth"), role(before, false, "Growth Lead")],
    },
  };
}
function company(url: string) {
  const n = Number(url.split("company-").pop());
  const c = companyOf(n);
  return { ...blitzCompany, company: { ...blitzCompany.company, name: c.name, domain: c.domain, linkedin_id: Number(c.linkedin_id), linkedin_url: c.linkedin_url } };
}

function stubBlitz() {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    if (path === "/v2/enrichment/person") return Response.json(person(body.person_linkedin_url));
    if (path === "/v2/enrichment/company") return Response.json(company(body.company_linkedin_url));
    throw new Error(`unexpected path ${path}`);
  };
  return () => { globalThis.fetch = original; };
}

/** Transactions committed or rolled back on this database, read after the pool has closed so every backend has flushed its counters. */
async function transactions(database: Awaited<ReturnType<typeof testDatabase>>) {
  const { rows } = await database.query<{ n: string }>("SELECT (xact_commit + xact_rollback)::text AS n FROM pg_stat_database WHERE datname = current_database()");
  return Number(rows[0].n);
}

/** Every query the app's pool sends is one round trip to the database: on Neon each costs a millisecond or two. */
let roundTrips = 0;
const originalQuery = pg.Client.prototype.query;
(pg.Client.prototype as any).query = function (this: pg.Client, ...args: unknown[]) {
  roundTrips += 1;
  return (originalQuery as any).apply(this, args);
};

type Phase = { items: number; seconds: number; transactions: number; roundTrips: number };
const perSecond = (p: Phase) => (p.items / p.seconds).toFixed(1);
const perItem = (p: Phase) => `${(p.transactions / p.items).toFixed(2)} tx/item, ${(p.roundTrips / p.items).toFixed(1)} round trips/item`;

async function run(workers: number) {
  const database = await testDatabase();
  const db = appDatabase();
  const restore = stubBlitz();
  try {
    const rows = Array.from({ length: PEOPLE }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/p${i}` }));
    const input = { provider: "blitz" as const, rows, maxPeople: PEOPLE, maxSpendUsd: 1, requestsPerSecond: 100_000 };
    const prepared = await prepareNetwork(db, "workflow-bench", `bench-${workers}`, input);
    if (prepared.status !== "running") throw new Error(prepared.status);
    const phase = async (kind: "people" | "companies", items: (NetworkPerson | string)[]): Promise<Phase> => {
      await closeDb();
      const before = await transactions(database);
      const client = appDatabase();
      const trips = roundTrips;
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
      const sent = roundTrips - trips;
      await closeDb();
      return { items: items.length, seconds, transactions: (await transactions(database)) - before, roundTrips: sent };
    };
    const people = await phase("people", prepared.people);
    const collected = await collectCompanies(appDatabase(), prepared.lease, prepared.people);
    assert.equal(collected.keys.length, COMPANIES);
    const companies = await phase("companies", collected.keys);
    await finishRun(appDatabase(), prepared.lease);
    const summary = await runSummary(appDatabase(), prepared.lease.id);
    assert.equal(summary.state, "complete");
    assert.equal(summary.outcomes.find((o) => o.phase === "people" && o.state === "done")?.count, PEOPLE);
    assert.equal(summary.outcomes.find((o) => o.phase === "companies" && o.state === "done")?.count, COMPANIES);
    const all: Phase = { items: people.items + companies.items, seconds: people.seconds + companies.seconds, transactions: people.transactions + companies.transactions, roundTrips: people.roundTrips + companies.roundTrips };
    console.log(
      `bench-network workers=${workers}: people ${people.items} in ${people.seconds.toFixed(1)}s (${perSecond(people)}/s, ${perItem(people)}); ` +
        `companies ${companies.items} in ${companies.seconds.toFixed(1)}s (${perSecond(companies)}/s, ${perItem(companies)}); ` +
        `all ${all.items} in ${all.seconds.toFixed(1)}s (${perSecond(all)}/s, ${perItem(all)})`,
    );
  } finally {
    restore();
  }
}

test(`network enrichment of ${PEOPLE} people with 12 workers`, () => run(12));
test(`network enrichment of ${PEOPLE} people with 1 worker`, () => run(1));
