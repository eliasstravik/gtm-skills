import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db as appDatabase, closeDb } from "../templates/lib/db";
import { testDatabase } from "./db";
import { normalizeBlitz } from "../templates/lib/profiles/normalize";
import { applyEvidence, getProfile, resolveIdentity } from "../templates/lib/profiles/store";
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
