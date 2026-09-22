import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db as appDatabase, closeDb } from "../templates/lib/db";
import { testDatabase } from "./db";
import { normalizeBlitz } from "../templates/lib/profiles/normalize";
import { applyEvidence, getProfile, resolveIdentity } from "../templates/lib/profiles/store";
import { prepareNetwork, beginItem, acceptItem, collectCompanies } from "../templates/lib/profiles/network";
import { finishRun, runSummary } from "../templates/lib/profiles/ledger";
import { providerRateLimits } from "../templates/lib/schema/ledger";
import { blitzPerson, blitzCompany, blitzNotFound, blitzRun } from "./blitz-fixtures";

async function database() {
  await testDatabase();
  return Object.assign(appDatabase(), { close() {} });
}
after(closeDb);
const source = () => ({ workflow_id: "w", source_id: "import", source_row_id: "1", first_observed_at: "2026-09-01", last_observed_at: "2026-09-01" });
const at = "2026-09-17T18:00:00Z";

test("normalizeBlitz maps a person with every section state set", () => {
  const e = normalizeBlitz("people", blitzPerson, at, 0, "/v2/enrichment/person");
  assert.equal(e.provider, "blitz");
  assert.equal(e.endpoint, "/v2/enrichment/person");
  assert.equal(e.mode, "default");
  assert.equal(e.outcome, "success");
  assert.equal(e.fields.full_name, "Mira Holt");
  assert.equal(e.fields.linkedin_url, "https://www.linkedin.com/in/mira-holt-1a2b3c");
  assert.equal(e.fields.linkedin_profile_id, "ACoAAA1234");
  assert.equal(e.fields.connections_count, 812);
  assert.equal(e.fields.country_code, "NO");
  assert.equal(e.fields.location_label, "Oslo, NO");
  assert.equal(e.fields.primary_job_title, "Head of Growth");
  const experiences = e.fields.experiences_json as { title: string; company_domain: string; current_status: string; employment_type: string; location_label: string }[];
  assert.equal(experiences.length, 2);
  assert.equal(experiences[0].title, "Head of Growth");
  assert.equal(experiences[0].company_domain, "northwind.example");
  assert.equal(experiences[0].current_status, "current");
  assert.equal(experiences[0].employment_type, "Full-time");
  assert.equal(experiences[1].current_status, "ended");
  assert.equal(experiences[1].location_label, "Bergen, NO");
  assert.equal(e.sections.location_json, "complete");
  assert.equal(e.sections.experiences_json, "complete");
  assert.equal(e.sections.education_json, "complete");
  assert.equal(e.sections.skills_json, "complete");
  assert.equal(e.sections.certifications_json, "complete");
  for (const [field, value] of Object.entries(e.fields))
    if (field.endsWith("_json")) {
      assert.ok(e.sections[field], `${field} has a section state`);
      assert.notEqual(value, undefined);
    }
});

test("normalizeBlitz accepts the run envelope as well as the bare body", () => {
  const bare = normalizeBlitz("companies", blitzCompany, at, 0, "/v2/enrichment/company");
  const wrapped = normalizeBlitz("companies", blitzRun(blitzCompany, 200, "/v2/enrichment/company"), at, 0, "/v2/enrichment/company");
  assert.deepEqual(wrapped.fields, bare.fields);
  assert.equal(bare.outcome, "success");
  assert.equal(bare.fields.name, "Northwind");
  assert.equal(bare.fields.domain, "northwind.example");
  assert.equal(bare.fields.linkedin_url, "https://www.linkedin.com/company/northwind-example");
  assert.equal(bare.fields.linkedin_company_id, "74068990");
  assert.equal(bare.fields.linkedin_employee_count, 21);
  assert.equal(bare.fields.founded_year, 2021);
  assert.equal(bare.fields.founded_on, "2021");
  assert.equal(bare.fields.headquarters_country_code, "NO");
  assert.equal(bare.fields.headquarters_label, "Oslo, NO");
  assert.deepEqual(bare.fields.industries_json, ["Software Development"]);
  assert.deepEqual(bare.fields.specialties_json, ["data", "samples"]);
  assert.equal(bare.sections.industries_json, "complete");
  assert.equal(bare.sections.specialties_json, "complete");
  assert.equal(bare.sections.locations_json, "complete");
});

test("normalizeBlitz reports found:false as no_match", () => {
  const e = normalizeBlitz("people", blitzNotFound, at, 0, "/v2/enrichment/person");
  assert.equal(e.outcome, "no_match");
  assert.deepEqual(e.fields, {});
});

test("a Blitz person with location and experiences ends enriched, not partial", async () => {
  const db = await database();
  try {
    const r = await resolveIdentity(db, "people", { linkedin_url: blitzPerson.person.linkedin_url }, source());
    if (r.status !== "resolved") throw new Error(r.status);
    const profile = await applyEvidence(db, "people", r.profile.key, normalizeBlitz("people", blitzPerson, at, 0, "/v2/enrichment/person"));
    assert.equal(profile.enrichment_status, "enriched");
    assert.equal((await getProfile(db, "people", r.profile.key))?.city, "Oslo");
  } finally {
    db.close();
  }
});

type Call = { url: string; body: any };
function stubBlitz(calls: Call[], handler: (path: string, body: any) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (!String(url).startsWith("https://api.blitz-api.ai")) throw new Error(`unexpected host ${url}`);
    const path = new URL(String(url)).pathname;
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    calls.push({ url: String(url), body });
    return handler(path, body);
  };
  return () => {
    globalThis.fetch = original;
  };
}
const outcome = (summary: Awaited<ReturnType<typeof runSummary>>, phase: string, state: string) =>
  summary.outcomes.find((o) => o.phase === phase && o.state === state)?.count ?? 0;

test("provider blitz calls Blitz only, reuses fresh work, and never leaves cost uncertain", async () => {
  const db = await database();
  const calls: Call[] = [];
  const restore = stubBlitz(calls, (path, body) => {
    if (path === "/v2/enrichment/person")
      return Response.json({ ...blitzPerson, person: { ...blitzPerson.person, linkedin_url: body.person_linkedin_url, full_name: `Person ${body.person_linkedin_url.split("/").pop()}` } });
    if (path === "/v2/enrichment/company") return Response.json(blitzCompany);
    throw new Error(`unexpected path ${path}`);
  });
  try {
    const rows = Array.from({ length: 5 }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/p${i}` }));
    const input = { provider: "blitz" as const, rows, maxPeople: 10, maxSpendUsd: 1 };
    let run = await prepareNetwork(db, "workflow-b", "first", input);
    if (run.status !== "running") throw new Error(run.status);
    for (const p of run.people) {
      const r = await beginItem(db, run.lease, "people", p, input, "key");
      if (r.state !== "ready") throw new Error(r.state);
      await acceptItem(db, run.lease, "people", p, r, input);
    }
    const companies = await collectCompanies(db, run.lease, run.people);
    assert.equal(companies.keys.length, 1); // every fixture person currently works at Northwind
    for (const key of companies.keys) {
      const r = await beginItem(db, run.lease, "companies", key, input, "key");
      if (r.state !== "ready") throw new Error(r.state);
      await acceptItem(db, run.lease, "companies", key, r, input);
    }
    await finishRun(db, run.lease);
    const summary = await runSummary(db, run.lease.id);
    assert.equal(summary.state, "complete");
    assert.equal(summary.spentUsd, 0);
    assert.equal(summary.uncertainSpendUsd, 0);
    assert.equal(outcome(summary, "people", "done"), 5);
    assert.equal(outcome(summary, "companies", "done"), 1);
    assert.equal(calls.filter((c) => c.url.endsWith("/v2/enrichment/person")).length, 5);
    assert.equal(calls.filter((c) => c.url.endsWith("/v2/enrichment/company")).length, 1);
    const company = await getProfile(db, "companies", companies.keys[0]);
    assert.equal(company?.enrichment_status, "enriched");
    // A second run inside the freshness window makes no call.
    const before = calls.length;
    run = await prepareNetwork(db, "workflow-b", "second", input);
    if (run.status !== "running") throw new Error(run.status);
    for (const p of run.people) assert.equal((await beginItem(db, run.lease, "people", p, input, "key")).state, "reused");
    await finishRun(db, run.lease);
    assert.equal(calls.length, before);
  } finally {
    restore();
    db.close();
  }
});

test("a domain-only company is resolved to a LinkedIn URL first, and a miss marks it unresolved", async () => {
  const db = await database();
  const calls: Call[] = [];
  const restore = stubBlitz(calls, (path, body) => {
    if (path === "/v2/enrichment/domain-to-linkedin")
      return Response.json(body.domain === "known.example" ? { company_linkedin_url: "https://www.linkedin.com/company/known-example" } : { company_linkedin_url: null });
    if (path === "/v2/enrichment/company")
      return Response.json({ ...blitzCompany, company: { ...blitzCompany.company, name: "Known", domain: "known.example", linkedin_url: body.company_linkedin_url, linkedin_id: 1 } });
    throw new Error(`unexpected path ${path}`);
  });
  try {
    const input = { provider: "blitz" as const, maxSpendUsd: 1 };
    const known = await resolveIdentity(db, "companies", { domain: "known.example", name: "Known" }, source());
    const unknown = await resolveIdentity(db, "companies", { domain: "unknown.example", name: "Unknown" }, source());
    if (known.status !== "resolved" || unknown.status !== "resolved") throw new Error("fixture");
    const run = await prepareNetwork(db, "workflow-c", "run", { ...input, rows: [] });
    if (run.status !== "running") throw new Error(run.status);
    const a = await beginItem(db, run.lease, "companies", known.profile.key, input, "key");
    assert.equal(a.state, "ready");
    if (a.state === "ready") await acceptItem(db, run.lease, "companies", known.profile.key, a, input);
    assert.deepEqual(calls.map((c) => new URL(c.url).pathname), ["/v2/enrichment/domain-to-linkedin", "/v2/enrichment/company"]);
    assert.equal((await getProfile(db, "companies", known.profile.key))?.linkedin_url, "https://www.linkedin.com/company/known-example");
    const b = await beginItem(db, run.lease, "companies", unknown.profile.key, input, "key");
    assert.equal(b.state, "unresolved");
    assert.equal((await getProfile(db, "companies", unknown.profile.key))?.enrichment_status, "unresolved");
    await finishRun(db, run.lease);
  } finally {
    restore();
    db.close();
  }
});

test("Blitz requests are paced through the shared table", async () => {
  const db = await database();
  const calls: Call[] = [];
  const stamps: number[] = [];
  const restore = stubBlitz(calls, () => {
    stamps.push(Date.now());
    return Response.json(blitzPerson);
  });
  try {
    const rows = Array.from({ length: 12 }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/q${i}` }));
    const input = { provider: "blitz" as const, rows, maxPeople: 12, maxSpendUsd: 1, requestsPerSecond: 10 };
    const run = await prepareNetwork(db, "workflow-d", "paced", input);
    if (run.status !== "running") throw new Error(run.status);
    const started = Date.now();
    await Promise.all(
      run.people.map(async (p) => {
        const r = await beginItem(db, run.lease, "people", p, input, "key");
        if (r.state === "ready") await acceptItem(db, run.lease, "people", p, r, input);
      }),
    );
    assert.equal(stamps.length, 12);
    // 12 requests at 10 per second span at least 1.1 s between first and last.
    assert.ok(Math.max(...stamps) - Math.min(...stamps) >= 1000, `spread ${Math.max(...stamps) - Math.min(...stamps)}ms`);
    const [row] = await db.select().from(providerRateLimits);
    assert.equal(row.provider, "blitz");
    assert.ok(row.next_allowed_at >= started);
    await finishRun(db, run.lease);
  } finally {
    restore();
    db.close();
  }
});

test("Blitz retries 429 and 5xx, then records the last answer; 404 is no_match, 500 is failed", async () => {
  const db = await database();
  let flaky = 0;
  const calls: Call[] = [];
  const restore = stubBlitz(calls, (_path, body) => {
    const who = String(body.person_linkedin_url);
    if (who.endsWith("flaky")) {
      flaky += 1;
      return new Response("busy", { status: 429 });
    }
    if (who.endsWith("gone")) return new Response("{}", { status: 404 });
    if (who.endsWith("broken")) return new Response("{}", { status: 500 });
    return Response.json(blitzPerson);
  });
  try {
    const rows = ["flaky", "gone", "broken", "fine"].map((s) => ({ profile_url: `https://www.linkedin.com/in/${s}` }));
    const input = { provider: "blitz" as const, rows, maxPeople: 4, maxSpendUsd: 1 };
    const run = await prepareNetwork(db, "workflow-e", "errors", input);
    if (run.status !== "running") throw new Error(run.status);
    for (const p of run.people) {
      const r = await beginItem(db, run.lease, "people", p, input, "key");
      assert.equal(r.state, "ready", p.key);
      if (r.state === "ready") await acceptItem(db, run.lease, "people", p, r, input);
    }
    assert.equal(flaky, 3);
    assert.equal(calls.filter((c) => c.body.person_linkedin_url.endsWith("broken")).length, 3);
    await finishRun(db, run.lease);
    const summary = await runSummary(db, run.lease.id);
    assert.equal(summary.spentUsd, 0);
    assert.equal(summary.uncertainSpendUsd, 0);
    assert.equal(outcome(summary, "people", "done"), 1);
    assert.equal(outcome(summary, "people", "no_match"), 1);
    assert.equal(outcome(summary, "people", "failed"), 2);
  } finally {
    restore();
    db.close();
  }
});
