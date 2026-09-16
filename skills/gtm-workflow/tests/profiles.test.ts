import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import {
  profileSchemaSql,
  peopleFields,
  companiesFields,
  validateFields,
} from "../templates/lib/profiles/schema";
import {
  applyEvidence,
  resolveIdentity,
  getProfile,
  currentCompanies,
  isFresh,
  recentMiss,
  type Evidence,
} from "../templates/lib/profiles/store";
import {
  normalizeClay,
  normalizeContactOut,
  partialDate,
} from "../templates/lib/profiles/normalize";
import {
  ledgerSchemaSql,
  beginRun,
  reserve,
  dispatch,
  settle,
  runSummary,
  saveWork,
  markWork,
  finishRun,
  cancelRun,
} from "../templates/lib/profiles/ledger";
import { people, companies } from "../templates/lib/profiles/schema";
import { profileView } from "../templates/lib/profiles/view";
import { readData, readCounts } from "../templates/lib/data-api";
import { effectivePolicy } from "../templates/lib/viewer-policy";
import {
  prepareNetwork,
  beginItem,
  acceptItem,
  collectCompanies,
} from "../templates/lib/profiles/network";
import { startLookup, pollLookup } from "../templates/lib/profiles/provider";

async function database() {
  const c = createClient({ url: ":memory:" });
  await c.executeMultiple(profileSchemaSql() + ledgerSchemaSql);
  return c;
}
const source = (workflow = "a") => ({
  workflow_id: workflow,
  source_id: "import",
  source_row_id: "1",
  first_observed_at: "2026-09-01",
  last_observed_at: "2026-09-01",
});
const evidence = (
  fields: Record<string, unknown>,
  sections: Evidence["sections"] = {},
): Evidence => ({
  provider: "fixture",
  endpoint: "/profile",
  mode: "full",
  fetched_at: "2026-09-01T00:00:00Z",
  outcome: "success",
  cost_usd: 0,
  raw: { payload: fields },
  fields,
  sections,
});
test("all accepted fields have typed storage and validators", async () => {
  assert.equal(Object.keys(peopleFields).length, 80);
  assert.equal(Object.keys(companiesFields).length, 68);
  const db = await database();
  for (const [kind, fields] of [
    ["people", peopleFields],
    ["companies", companiesFields],
  ] as const) {
    assert.equal(
      (await db.execute(`PRAGMA table_info(${kind})`)).rows.length,
      Object.keys(fields).length,
    );
    for (const [name, type] of Object.entries(fields))
      validateFields(kind, {
        [name]:
          type === "TEXT"
            ? "value"
            : type === "BOOL"
              ? false
              : type === "JSON[]"
                ? []
                : type === "JSON{}"
                  ? {}
                  : 1,
      });
  }
  assert.throws(() => validateFields("people", { followers_count: "100" }));
  db.close();
});
test("membership is cumulative, provisional keys survive changed slugs, conflicts do not merge", async () => {
  const db = await database();
  const first = await resolveIdentity(
    db,
    "people",
    { linkedin_url: "linkedin.com/in/alex/" },
    source(),
  );
  assert.equal(first.status, "resolved");
  if (first.status !== "resolved") return;
  const key = first.profile.key;
  const updated = await applyEvidence(
    db,
    "people",
    key,
    evidence({
      linkedin_url: "https://linkedin.com/in/alex-new",
      linkedin_numeric_id: "999999999999999999999",
      full_name: "Alex",
    }),
  );
  assert.equal(updated.key, key);
  assert.equal(updated.linkedin_url, "https://www.linkedin.com/in/alex-new");
  const again = await resolveIdentity(
    db,
    "people",
    { linkedin_url: "https://linkedin.com/in/alex" },
    source("b"),
  );
  assert.equal(again.status, "resolved");
  assert.equal(
    (await getProfile(db, "people", key))?.linkedin_url,
    "https://www.linkedin.com/in/alex-new",
  );
  assert.equal((await getProfile(db, "people", key))?.sources_json.length, 2);
  const conflict = await applyEvidence(
    db,
    "people",
    key,
    evidence({ linkedin_numeric_id: "different", full_name: "Wrong person" }),
  );
  assert.equal(conflict.enrichment_status, "ambiguous");
  assert.equal(conflict.full_name, "Alex");
  assert.equal(
    (await resolveIdentity(db, "companies", {})).status,
    "unresolved",
  );
  assert.equal(
    (await db.execute("SELECT count(*) n FROM people")).rows[0].n,
    1,
  );
  db.close();
});
test("all current roles survive and company work is deduplicated without name merging", async () => {
  const db = await database();
  const person = await resolveIdentity(db, "people", {
    linkedin_url: "linkedin.com/in/roles",
  });
  if (person.status !== "resolved") throw new Error("fixture");
  const raw = {
    "Enrich person": {
      name: "Roles",
      experience: Array.from({ length: 9 }, (_, i) => ({
        company: i === 8 ? "Unresolved" : "Employer",
        company_url:
          i === 8
            ? undefined
            : `https://linkedin.com/company/${Math.floor(i / 2)}`,
        title: `Role ${i}`,
        is_current: i !== 7,
        start_date: "2020",
      })),
    },
  };
  const e = normalizeClay(raw, "2026-09-01T00:00:00Z", 0.054);
  const p = await applyEvidence(db, "people", person.profile.key, e);
  assert.equal(p.experiences_json.length, 9);
  assert.equal(p.primary_company_key, null);
  const companies = await currentCompanies(db, [p.key]);
  assert.equal(companies.roles, 8);
  assert.equal(companies.keys.length, 4);
  assert.equal(companies.unresolved, 1);
  const c = await applyEvidence(db, "companies", companies.keys[0], {
    ...evidence({}),
    outcome: "failed",
  });
  assert.equal(c.enrichment_status, "failed");
  assert.equal((await currentCompanies(db, [p.key])).roles, 8);
  db.close();
});
test("partial, null, no-match and failed refreshes preserve accepted values; complete empty replaces", async () => {
  const db = await database();
  const r = await resolveIdentity(db, "people", {
    linkedin_url: "linkedin.com/in/refresh",
  });
  if (r.status !== "resolved") throw new Error("fixture");
  const key = r.profile.key;
  await applyEvidence(
    db,
    "people",
    key,
    evidence(
      { full_name: "Original", education_json: [{ school: "A" }] },
      { education_json: "complete" },
    ),
  );
  const partial = await applyEvidence(db, "people", key, {
    ...evidence(
      { full_name: null, education_json: [] },
      { education_json: "truncated" },
    ),
    fetched_at: "2026-09-02T00:00:00Z",
  });
  assert.equal(partial.full_name, "Original");
  assert.equal(partial.education_json.length, 1);
  const failure = await applyEvidence(db, "people", key, {
    ...evidence({}),
    outcome: "no_match",
    fetched_at: "2026-09-03T00:00:00Z",
  });
  assert.equal(failure.enriched_at, "2026-09-02T00:00:00Z");
  assert.equal(failure.education_json.length, 1);
  assert.ok(
    recentMiss(
      failure,
      "fixture",
      "/profile",
      "full",
      30 * 86400000,
      Date.parse("2026-09-04"),
    ),
  );
  await resolveIdentity(
    db,
    "people",
    { linkedin_url: "linkedin.com/in/refresh" },
    source(),
  );
  assert.equal(
    (await getProfile(db, "people", key))?.enriched_at,
    failure.enriched_at,
  );
  assert.equal(
    isFresh(
      failure,
      "fixture",
      "/profile",
      "full",
      ["education_json"],
      30 * 86400000,
      Date.parse("2026-09-04"),
    ),
    true,
  );
  const empty = await applyEvidence(db, "people", key, {
    ...evidence({ education_json: [] }, { education_json: "complete" }),
    fetched_at: "2026-09-04T00:00:00Z",
  });
  assert.deepEqual(empty.education_json, []);
  db.close();
});
test("verified adapters handle company envelopes, partial dates, counts and raw extras", () => {
  const raw = {
    companies: [
      {
        "example.com": {
          name: "Example",
          li_vanity: "example",
          size: "51-200",
          employees: 89,
          revenue: "$5M",
          technologies: ["Tool"],
          unknown_field: { kept: true },
        },
      },
    ],
  };
  const e = normalizeContactOut(raw, "example.com", "2026-09-01", 0.02);
  assert.equal(e.fields.name, "Example");
  assert.equal(e.fields.linkedin_employee_count, 89);
  assert.equal(e.fields.reported_employee_count, undefined);
  assert.equal(e.fields.company_size_label, "51-200");
  assert.deepEqual(e.fields.revenue_json, { raw_value: "$5M" });
  assert.deepEqual(e.raw, raw);
  assert.equal(partialDate("2020"), "2020");
  assert.equal(partialDate({ year: 2020, month: 2 }), "2020-02");
  assert.equal(partialDate("2023-02-29"), null);
});
test("one durable budget spans 120 people and 120 companies and resumes without repurchase", async () => {
  const db = await database(),
    lease = { id: "run", owner: "worker" };
  await beginRun(db, {
    ...lease,
    workflowId: "a",
    budgetUsd: 1.8,
    input: [],
    omitted: 2,
  });
  assert.equal(
    (
      await beginRun(db, {
        id: "other",
        owner: "other",
        workflowId: "b",
        budgetUsd: 20,
        input: [],
        omitted: 0,
      })
    ).status,
    "already_running",
  );
  for (const phase of ["people", "companies"] as const) {
    const keys = Array.from({ length: 120 }, (_, i) => `${phase}-${i}`);
    await saveWork(db, lease, phase, keys);
    for (const key of keys) {
      const r = await reserve(db, lease, key, phase, 0.01);
      if (r.status === "reserved") {
        assert.equal(await dispatch(db, lease, r.id), true);
        assert.equal(await dispatch(db, lease, r.id), false);
        await settle(db, r.id, 0.01, { ok: true });
        await markWork(db, lease, phase, key, "done");
      } else {
        assert.equal(r.status, "budget_deferred");
        await markWork(db, lease, phase, key, "budget_deferred");
      }
    }
  }
  assert.equal((await runSummary(db, lease.id)).spentUsd, 1.8);
  assert.equal(
    (await reserve(db, lease, "people-0", "people", 0.01)).status,
    "existing",
  );
  await finishRun(db, lease);
  assert.equal((await runSummary(db, lease.id)).state, "partial");
  db.close();
});
test("uncertain dispatch remains reserved after lock expiry and cancellation", async () => {
  const db = await database(),
    lease = { id: "uncertain", owner: "worker" };
  await beginRun(db, {
    ...lease,
    workflowId: "a",
    budgetUsd: 1,
    input: [],
    omitted: 0,
  });
  const attempt = await reserve(db, lease, "person", "lookup", 0.5);
  if (attempt.status !== "reserved") throw new Error("fixture");
  await dispatch(db, lease, attempt.id);
  await cancelRun(db, lease.id);
  await assert.rejects(() => reserve(db, lease, "another", "lookup", 0.5));
  const next = { id: "next", owner: "next" };
  await beginRun(db, {
    ...next,
    workflowId: "a",
    budgetUsd: 1,
    input: [],
    omitted: 0,
  });
  assert.equal(
    (await reserve(db, next, "person", "lookup", 0.5)).status,
    "existing",
  );
  assert.equal((await runSummary(db, lease.id)).uncertainSpendUsd, 0.5);
  db.close();
});
test("shared companies never expose another workflow's population or metadata", async () => {
  const db = await database();
  for (const workflow of ["a", "b"]) {
    const p = await resolveIdentity(
      db,
      "people",
      { linkedin_url: `linkedin.com/in/${workflow}` },
      source(workflow),
    );
    if (p.status !== "resolved") throw new Error("fixture");
    const e = normalizeClay(
      {
        "Enrich person": {
          name: workflow,
          experience: [
            {
              company: "Shared",
              company_url: "https://linkedin.com/company/shared",
              title: "Founder",
              is_current: true,
            },
          ],
        },
      },
      "2026-09-01",
      0,
    );
    await applyEvidence(db, "people", p.profile.key, e);
  }
  const registry = { people, companies },
    view = profileView("a");
  assert.ok(effectivePolicy(view, registry));
  assert.equal(
    effectivePolicy(
      { ...view, sharePolicy: { ...view.sharePolicy, version: "99" } },
      registry,
    ),
    undefined,
  );
  const counts = await readCounts(view.data, registry, db);
  assert.deepEqual(
    counts.map((c) => c.total),
    [1, 1],
  );
  const companyPage = await readData(
    view.data,
    registry,
    db,
    new URL("http://test/?table=companies"),
  );
  assert.equal(companyPage.rows[0].at(-1)?.value, "View 1");
  const back = await readData(
    view.data,
    registry,
    db,
    new URL(
      `http://test/?table=people&relatedTable=companies&relatedKey=${companyPage.keys[0]}`,
    ),
  );
  assert.equal(back.total, 1);
  assert.equal(back.rows[0][0].value, "a");
  assert.equal(
    (
      await readData(
        view.data,
        registry,
        db,
        new URL("http://test/?table=people&q=b"),
      )
    ).total,
    0,
  );
  const foreign = (
    await db.execute("SELECT key FROM people WHERE full_name = 'b'")
  ).rows[0].key;
  assert.equal(
    (
      await readData(
        view.data,
        registry,
        db,
        new URL(`http://test/?table=people&key=${foreign}`),
      )
    ).total,
    0,
  );
  const shared = structuredClone(view.data);
  for (const table of shared.tables) {
    const p = view.sharePolicy.tables.find((p) => p.name === table.name)!;
    table.columns = p.columns;
    table.nested = p.nested;
  }
  await assert.rejects(() =>
    readData(
      shared,
      registry,
      db,
      new URL("http://test/?table=people&columns=raw_responses_json"),
    ),
  );
  const safe = await readData(
    shared,
    registry,
    db,
    new URL("http://test/?table=people&columns=experiences_json"),
  );
  assert.equal((safe.rows[0][0].value as any[])[0].original, undefined);
  assert.equal((safe.rows[0][0].value as any[])[0].title, "Founder");
  assert.equal(safe.fields.length, 1);
  db.close();
});
test("network phases resume 120 saved people and 120 companies without buying completed work again", async () => {
  const db = await database(),
    original = globalThis.fetch;
  const purchases = new Map<string, number>();
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(String(options?.body));
    if (String(url).endsWith("/inspect"))
      return Response.json({
        price: {
          type: body.provider === "clay" ? "PER_CALL" : "PER_RESULT",
          amount: { value: 0.01, currency: "USD" },
        },
      });
    const input = body.input.body;
    const identity = input["Professional Profile URL"] ?? input.domains?.[0];
    purchases.set(identity, (purchases.get(identity) ?? 0) + 1);
    const n = String(identity).match(/\d+/)![0];
    const output =
      body.provider === "clay"
        ? {
            "Enrich person": {
              url: identity,
              name: `Person ${n}`,
              experience: [
                {
                  title: "Founder",
                  company: `Company ${n}`,
                  company_url: `https://linkedin.com/company/c${n}`,
                  company_domain: `c${n}.example`,
                  is_current: true,
                },
              ],
            },
          }
        : {
            companies: [
              {
                [identity]: {
                  name: `Company ${n}`,
                  li_vanity: `https://linkedin.com/company/c${n}`,
                  domain: identity,
                },
              },
            ],
          };
    return Response.json({
      status: "COMPLETED",
      output,
      cost: { value: 0.01, currency: "USD" },
    });
  };
  try {
    const rows = Array.from({ length: 125 }, (_, i) => ({
      profile_url: `https://linkedin.com/in/p${i}`,
    }));
    let run = await prepareNetwork(db, "workflow-a", "first", {
      rows: [...rows, rows[0]],
      maxPeople: 120,
      maxSpendUsd: 20,
    });
    for (const p of run.people.slice(0, 60)) {
      const r = await beginItem(db, run.lease, "people", p, {}, "fixture");
      if (r.state !== "ready") throw new Error(r.state);
      await acceptItem(db, run.lease, "people", p, r);
    }
    await cancelRun(db, run.lease.id);
    run = await prepareNetwork(db, "workflow-a", "resumed", {
      resumeRunId: "first",
    });
    for (const p of run.people) {
      const r = await beginItem(db, run.lease, "people", p, {}, "fixture");
      if (r.state === "ready") await acceptItem(db, run.lease, "people", p, r);
      else assert.equal(r.state, "reused");
    }
    const current = await collectCompanies(db, run.lease, run.people);
    assert.equal(current.keys.length, 120);
    assert.equal(current.roles, 120);
    for (const key of current.keys) {
      const r = await beginItem(db, run.lease, "companies", key, {}, "fixture");
      if (r.state !== "ready") throw new Error(r.state);
      await acceptItem(db, run.lease, "companies", key, r);
    }
    await finishRun(db, run.lease);
    const summary = await runSummary(db, run.lease.id);
    assert.equal(summary.state, "complete");
    assert.equal(summary.omitted, 5);
    assert.equal(summary.spentUsd, 2.4);
    assert.equal(purchases.size, 240);
    assert.ok([...purchases.values()].every((n) => n === 1));
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
test("async provider jobs resume by ID and lost dispatch responses never repeat POST", async () => {
  const db = await database(),
    lease = { id: "async", owner: "worker" };
  await beginRun(db, {
    ...lease,
    workflowId: "a",
    budgetUsd: 1,
    input: [],
    omitted: 0,
  });
  let posts = 0;
  const fetcher: typeof fetch = async (url) => {
    if (String(url).endsWith("/inspect"))
      return Response.json({
        price: { type: "PER_CALL", amount: { value: 0.1, currency: "USD" } },
      });
    if (String(url).endsWith("/run")) {
      posts++;
      return Response.json(
        { runId: "job", status: "RUNNING" },
        { status: 202 },
      );
    }
    return Response.json({
      runId: "job",
      status: "COMPLETED",
      output: {},
      cost: { value: 0.1, currency: "USD" },
    });
  };
  const op = {
    provider: "clay",
    endpoint: "/enrichment/person",
    body: { Email: "a@example.com" },
  };
  const first = await startLookup(db, lease, "person", op, "fixture", fetcher);
  assert.equal(first.state, "pending");
  const resumed = await startLookup(
    db,
    lease,
    "person",
    op,
    "fixture",
    fetcher,
  );
  if (resumed.state !== "pending") throw new Error(resumed.state);
  await pollLookup(db, resumed.attemptId, resumed.jobId, "fixture", fetcher);
  assert.equal(posts, 1);
  const lost: typeof fetch = async (url, options) =>
    String(url).endsWith("/run")
      ? Promise.reject(new Error("connection lost"))
      : fetcher(url, options);
  assert.equal(
    (await startLookup(db, lease, "lost", op, "fixture", lost)).state,
    "uncertain",
  );
  assert.equal(
    (await startLookup(db, lease, "lost", op, "fixture", fetcher)).state,
    "uncertain",
  );
  assert.equal(posts, 1);
  assert.equal((await runSummary(db, lease.id)).uncertainSpendUsd, 0.1);
  db.close();
});

test("email evidence and network imports share identities without accepting model claims", async () => {
  const { profileAgentCall } = await import(
    "../templates/lib/profiles/agent-bridge"
  );
  const db = await database(),
    original = globalThis.fetch;
  let purchases = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/inspect"))
      return Response.json({
        price: { type: "PER_CALL", amount: { value: 0.01, currency: "USD" } },
      });
    purchases++;
    return Response.json({
      status: "COMPLETED",
      cost: { value: 0.01, currency: "USD" },
      output: {
        "Enrich person": {
          name: "Ada",
          url: "https://linkedin.com/in/ada",
          experience: [
            {
              title: "Founder",
              company: "Example",
              company_url: "https://linkedin.com/company/example",
              is_current: true,
            },
          ],
        },
      },
    });
  };
  try {
    const email = await prepareNetwork(db, "email", "email-run", {
      rows: [{ email: "ada@example.test" }],
    });
    await profileAgentCall(
      db,
      { lease: email.lease, person: email.people[0] },
      "monid_run",
      {
        provider: "clay",
        endpoint: "/enrichment/person",
        input: { body: { Email: "ada@example.test" } },
      },
      "fixture",
    );
    await finishRun(db, email.lease);
    const network = await prepareNetwork(db, "network", "network-run", {
      rows: [{ profile_url: "https://linkedin.com/in/ada" }],
    });
    assert.equal(
      (
        await beginItem(
          db,
          network.lease,
          "people",
          network.people[0],
          {},
          "fixture",
        )
      ).state,
      "reused",
    );
    await finishRun(db, network.lease);
    const repeated = await prepareNetwork(db, "email", "repeat", {
      rows: [{ email: "ada@example.test" }],
    });
    const result = await profileAgentCall(
      db,
      { lease: repeated.lease, person: repeated.people[0] },
      "monid_run",
      {
        provider: "clay",
        endpoint: "/enrichment/person",
        input: { body: { Email: "ada@example.test" } },
      },
      "fixture",
    );
    assert.ok(JSON.stringify(result).includes("Ada"));
    assert.equal(purchases, 1);
    assert.equal(
      (await db.execute("SELECT count(*) n FROM people")).rows[0].n,
      1,
    );
    assert.equal(
      (await db.execute("SELECT count(*) n FROM companies")).rows[0].n,
      1,
    );
    assert.equal(
      JSON.parse(
        String(
          (await db.execute("SELECT sources_json FROM people")).rows[0]
            .sources_json,
        ),
      ).length,
      2,
    );
  } finally {
    globalThis.fetch = original;
    db.close();
  }
});
