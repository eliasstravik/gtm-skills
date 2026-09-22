// What Postgres changed for the profile store: one explicit write lock, and identity in profile_identifiers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { closeDb, db, writeLock, writeTransaction } from "../templates/lib/db";
import { readData, type WorkflowData } from "../templates/lib/data-api";
import { companies, people } from "../templates/lib/profiles/schema";
import { applyEvidence, deleteProfile, getProfile, markUnresolved, resolveIdentity, type Evidence } from "../templates/lib/profiles/store";
import { testDatabase } from "./db";

after(closeDb);
const source = (workflow: string, row: string) => ({ workflow_id: workflow, source_id: "import", source_row_id: row, first_observed_at: "2026-09-01", last_observed_at: "2026-09-01" });
const resolved = async (...args: Parameters<typeof resolveIdentity> extends [unknown, ...infer Rest] ? Rest : never) => {
  const result = await resolveIdentity(db(), ...args);
  assert.equal(result.status, "resolved");
  return (result as Extract<typeof result, { status: "resolved" }>).profile;
};

test("a second writer fails after the limit instead of waiting for ever", async () => {
  const database = await testDatabase();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const hasLock = new Promise<void>((resolve) => { locked = resolve; });
  const first = db().transaction(async (tx) => { await writeLock(tx); locked(); await held; });
  await hasLock;
  const started = Date.now();
  await assert.rejects(db().transaction((tx) => writeLock(tx, "300ms")), (error: { cause?: { code?: string } }) => error.cause?.code === "55P03");
  assert.ok(Date.now() - started < 5_000);
  // Re-entrant inside one transaction, and free again once the holder commits.
  release();
  await first;
  await db().transaction(async (tx) => { await writeLock(tx, "300ms"); await writeLock(tx, "300ms"); });
  assert.equal((await database.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'")).rows[0].n, 0);
});

test("an identifier has one owner: lookups find it, merges move it, deletes free it", async () => {
  const database = await testDatabase();
  const identifiers = async (key: string) => (await database.query("SELECT namespace, value FROM gtm.profile_identifiers WHERE key = $1 ORDER BY 1, 2", [key])).rows.map((row) => `${row.namespace}=${row.value}`);
  const byUrl = await resolved("people", { linkedin_url: "linkedin.com/in/Ada/" });
  // Another spelling of the same URL, and later the same id, find the record that owns them.
  assert.equal((await resolved("people", { linkedin_url: "https://www.linkedin.com/in/ada" })).key, byUrl.key);
  const byId = await resolved("people", { linkedin_profile_id: "ACoAA-ada" });
  assert.notEqual(byId.key, byUrl.key);
  assert.deepEqual(await identifiers(byId.key), ["linkedin_profile_id=ACoAA-ada"]);
  // Evidence that carries both bridges the two records: the older survives and owns everything, including the loser's key.
  const merged = await resolved("people", { linkedin_profile_id: "ACoAA-ada", linkedin_url: "linkedin.com/in/ada" });
  assert.equal(merged.key, byUrl.key);
  assert.deepEqual(await identifiers(byUrl.key), [`internal_key=${byId.key}`, "linkedin_profile_id=ACoAA-ada", "linkedin_url=https://www.linkedin.com/in/ada"]);
  assert.deepEqual(await identifiers(byId.key), []);
  assert.equal((await getProfile(db(), "people", byId.key))?.key, byUrl.key, "the loser's key still finds the survivor");
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 1);
  // The same identifier on a company is a different claim.
  const company = await resolved("companies", { linkedin_url: "linkedin.com/company/ada" });
  assert.notEqual(company.key, byUrl.key);
  // Deleting the record frees its identifiers in the same transaction.
  await deleteProfile(db(), "people", byUrl.key);
  assert.deepEqual(await identifiers(byUrl.key), []);
  const reborn = await resolved("people", { linkedin_url: "linkedin.com/in/ada" });
  assert.notEqual(reborn.key, byUrl.key);
});

test("300 resolutions started at once all complete behind one lock and a pool of five", async () => {
  const database = await testDatabase();
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: 300 }, (_, i) => resolveIdentity(db(), "people", { linkedin_url: `linkedin.com/in/person-${i % 150}` }, source("w", String(i)))));
  assert.ok(results.every((result) => result.status === "resolved"));
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 150);
  assert.ok(Date.now() - started < 60_000);
});

test("writers queue in this process, not in the pool: a slow lock holder fails nobody and reads stay possible", async () => {
  const database = await testDatabase();
  // Another process holds the write lock for longer than the pool waits for a free client (10 seconds). Without a
  // queue, five writers sit on the five pooled clients and the rest fail with "timeout exceeded when trying to connect".
  const pg = (await import("pg")).default;
  const outside = new pg.Client({ connectionString: database.unpooled });
  await outside.connect();
  await outside.query("SELECT pg_advisory_lock(7461)");
  const writers = Array.from({ length: 12 }, (_, i) => resolveIdentity(db(), "people", { linkedin_url: `linkedin.com/in/queued-${i}` }));
  const settled = Promise.allSettled(writers);
  let read: unknown;
  try {
    await new Promise((resolve) => setTimeout(resolve, 11_500));
    // While they wait, the pool still serves reads.
    read = await db().execute("SELECT 1 AS one").then((result) => result.rows[0].one, (error) => error.message);
  } finally {
    await outside.query("SELECT pg_advisory_unlock(7461)");
    await outside.end();
  }
  const results = await settled;
  assert.equal(read, 1);
  assert.deepEqual(results.filter((result) => result.status === "rejected").map((result) => String((result as PromiseRejectedResult).reason?.cause?.message ?? (result as PromiseRejectedResult).reason)), []);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 12);
});

test("behind a lock that never frees, the head of the queue times out and the writers behind it fail at once", async () => {
  const database = await testDatabase();
  const pg = (await import("pg")).default;
  const outside = new pg.Client({ connectionString: database.unpooled });
  await outside.connect();
  await outside.query("SELECT pg_advisory_lock(7461)");
  try {
    const started = Date.now();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => writeTransaction(db(), async () => "wrote", "400ms")));
    assert.deepEqual(results.map((result) => result.status), Array(6).fill("rejected"));
    assert.ok(Date.now() - started < 1_500, "six writers must not each wait the limit in turn");
  } finally { await outside.query("SELECT pg_advisory_unlock(7461)"); await outside.end(); }
  // Once the lock is free, new writers go through again.
  assert.equal(await writeTransaction(db(), async () => "wrote"), "wrote");
});

test("text the database cannot hold is cleaned on the way in", async () => {
  await testDatabase();
  const person = await resolved("people", { linkedin_url: "linkedin.com/in/nul" });
  const evidence: Evidence = { provider: "fixture", endpoint: "/profile", mode: "full", fetched_at: "2026-09-02T00:00:00Z", outcome: "success", cost_usd: 0, raw: { page: "before\u0000after" }, fields: { full_name: "Nu\u0000l", skills_json: ["a\u0000b"] }, sections: { skills_json: "complete" } };
  const saved = await applyEvidence(db(), "people", person.key, evidence);
  assert.equal(saved.enrichment_status, "enriched");
  const stored = await getProfile(db(), "people", person.key);
  assert.equal(stored?.full_name, "Nul");
  assert.deepEqual(stored?.skills_json, ["ab"]);
});

test("membership and company population from SQL equal a recompute from the stored JSON", async () => {
  await testDatabase();
  let seed = 7;
  const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const role = (n: number, status: "current" | "ended" = "current") => ({
    experience_key: `e${n}-${status}`, company_key: null, company_name: `Company ${n}`, title: "Role", start_date: null, end_date: null,
    current_status: status, current_status_evidence: null, company_linkedin_id: `c${n}`, company_linkedin_url: `https://www.linkedin.com/company/company-${n}`, company_domain: `company${n}.example`,
  });
  const keys: string[] = [];
  for (let step = 0; step < 200; step++) {
    const n = random(24), operation = random(6);
    if (operation <= 1) keys.push((await resolved("people", { linkedin_url: `https://www.linkedin.com/in/person-${n}` }, source(`w${random(3)}`, String(n)))).key);
    else if (operation === 2 && keys.length) {
      const key = keys[random(keys.length)];
      if (await getProfile(db(), "people", key))
        await applyEvidence(db(), "people", key, { provider: "fixture", endpoint: "profile", mode: "full", fetched_at: `2026-09-02T00:00:${String(step % 60).padStart(2, "0")}Z`, outcome: "success", raw: { step }, cost_usd: 0, sections: { experiences_json: "complete" }, fields: { experiences_json: [role(random(5)), role(random(5), "ended")] } });
    } else if (operation === 3) {
      // Two profiles for one company, later bridged by an id: a merge that rewrites people's roles.
      await resolveIdentity(db(), "companies", { linkedin_url: `https://www.linkedin.com/company/company-${n % 5}` }, source("w0", `c${n}`));
      await resolveIdentity(db(), "companies", { linkedin_company_id: `c${n % 5}`, linkedin_url: `https://www.linkedin.com/company/company-${n % 5}` });
    } else if (operation === 4 && keys.length) await db().update(people).set({ sources_json: [source(`w${random(3)}`, "raw")] }).where(eq(people.key, keys[random(keys.length)]));
    else if (operation === 5 && keys.length) await deleteProfile(db(), "people", keys[random(keys.length)]);
  }
  const stored = await db().select({ key: people.key, sources_json: people.sources_json, experiences_json: people.experiences_json }).from(people);
  const companyKeys = new Set((await db().select({ key: companies.key }).from(companies)).map((row) => row.key));
  let members = 0, employers = 0;
  for (const workflow of ["w0", "w1", "w2"]) {
    const inWorkflow = stored.filter((row) => ((row.sources_json ?? []) as { workflow_id: string }[]).some((s) => s.workflow_id === workflow));
    const expectedPeople = inWorkflow.map((row) => row.key).sort();
    const expectedCompanies = [...new Set(inWorkflow.flatMap((row) => ((row.experiences_json ?? []) as { company_key: string | null; current_status: string }[]).filter((e) => e.current_status === "current" && e.company_key && companyKeys.has(e.company_key)).map((e) => e.company_key!)))].sort();
    const config: WorkflowData = {
      tables: [{ name: "people", label: "People", labelColumn: "key", columns: ["key"] }, { name: "companies", label: "Companies", labelColumn: "key", columns: ["key"] }],
      rowPolicies: {
        people: { version: "shared-profiles-v1", membership: { column: "sources_json", workflowId: workflow } },
        companies: { version: "shared-profiles-v1", currentCompanies: { peopleTable: "people", workflowId: workflow } },
      } as WorkflowData["rowPolicies"],
    };
    const fromSql = async (table: string) => (await readData(config, { people, companies }, db(), new URL(`http://localhost/data?table=${table}`))).keys.sort();
    assert.deepEqual(await fromSql("people"), expectedPeople, `people of ${workflow}`);
    assert.deepEqual(await fromSql("companies"), expectedCompanies, `companies of ${workflow}`);
    members += expectedPeople.length; employers += expectedCompanies.length;
  }
  assert.ok(members > 5 && employers > 3, `the sequence must exercise both populations: ${members} members, ${employers} employers`);
  // No identifier outlives its record, and every record owns the values in its own identity columns.
  const orphans = await db().execute("SELECT i.key FROM gtm.profile_identifiers i WHERE NOT EXISTS (SELECT 1 FROM gtm.people p WHERE i.entity = 'people' AND p.key = i.key) AND NOT EXISTS (SELECT 1 FROM gtm.companies c WHERE i.entity = 'companies' AND c.key = i.key)");
  assert.deepEqual(orphans.rows, []);
  const unowned = await db().execute("SELECT p.key FROM gtm.people p WHERE p.linkedin_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gtm.profile_identifiers i WHERE i.entity = 'people' AND i.namespace = 'linkedin_url' AND i.value = p.linkedin_url AND i.key = p.key)");
  assert.deepEqual(unowned.rows, []);
});

test("markUnresolved records a terminal state without provider evidence", async () => {
  await testDatabase();
  const company = await resolved("companies", { linkedin_url: "https://www.linkedin.com/company/unresolved-example" }, source("a", "1"));
  await markUnresolved(db(), "companies", company.key, "No usable LinkedIn URL or domain");
  const profile = await getProfile(db(), "companies", company.key);
  assert.equal(profile?.enrichment_status, "unresolved");
  assert.equal(profile?.error, "No usable LinkedIn URL or domain");
  assert.ok(profile?.last_attempt_at);
  await markUnresolved(db(), "companies", "missing-key", "ignored"); // a missing profile is a no-op
});
