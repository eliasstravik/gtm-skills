// The network enrichment orchestration in workflow scope: one run of import, people, companies and summary, split
// into chunks that become child runs sharing the parent's run, lease and budget. The engine is replaced: children run
// in this process through the same function, exactly as the engine would start them.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, db } from "../templates/lib/db";
import { runNetwork, type ChunkReport, type NetworkRunInput } from "../templates/lib/profiles/network-workflow";
import { runSummary } from "../templates/lib/profiles/ledger";
import { getProfile } from "../templates/lib/profiles/store";
import { profileRuns } from "../templates/lib/schema/ledger";
import { blitzPerson, blitzCompany } from "./blitz-fixtures";
import { testDatabase } from "./db";

after(closeDb);

type Call = { path: string; body: any };
function stubBlitz(calls: Call[]) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const path = new URL(String(url)).pathname;
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    calls.push({ path, body });
    if (path === "/v2/enrichment/person") {
      const n = Number(body.person_linkedin_url.split("/p").pop());
      // Two people per company.
      const company = Math.floor(n / 2);
      return Response.json({
        ...blitzPerson,
        person: {
          ...blitzPerson.person,
          full_name: `Person ${n}`,
          linkedin_url: body.person_linkedin_url,
          linkedin_id: `ACoAA${n}`,
          experiences: [{ ...blitzPerson.person.experiences[0], company_name: `Company ${company}`, company_domain: `company-${company}.example`, company_linkedin_id: String(500 + company), company_linkedin_url: `https://www.linkedin.com/company/company-${company}` }],
        },
      });
    }
    if (path === "/v2/enrichment/company") return Response.json({ ...blitzCompany, company: { ...blitzCompany.company, name: "Company", linkedin_url: body.company_linkedin_url, linkedin_id: Number(body.company_linkedin_url.split("-").pop()) + 500 } });
    throw new Error(`unexpected path ${path}`);
  };
  return () => { globalThis.fetch = original; };
}

/**
 * The engine serializes a step's receiver along with its arguments: `engine.startChunks(...)` would send `engine`,
 * closures and all, and fail the run with "Cannot stringify a function" at `.thisVal`. Steps must be called bare.
 */
function assertNoReceiver(receiver: unknown, step: string) {
  assert.equal(receiver, undefined, `${step} was called as a method; the engine would serialize its receiver`);
}

/** Records what the parent asked the engine to do, and runs each child through runNetwork as the engine would. */
function fakeEngine(options: Omit<Parameters<typeof runNetwork>[0], "input" | "engine">) {
  const started: NetworkRunInput[] = [];
  const reports = new Map<string, ChunkReport>();
  const waiting = new Map<string, (report: ChunkReport) => void>();
  const engine = {
    async startChunks(this: unknown, _workflowId: string, inputs: NetworkRunInput[]) {
      assertNoReceiver(this, "startChunks");
      started.push(...inputs);
      // Children run concurrently, as separate runs would.
      await Promise.all(inputs.map((input) => runNetwork({ ...options, input, engine })));
      return inputs.map((_, i) => `child-${started.length - inputs.length + i}`);
    },
    awaitChunks(this: unknown, tokens: string[]) {
      assertNoReceiver(this, "awaitChunks");
      return Promise.all(tokens.map((token) => new Promise<ChunkReport>((resolve) => { const done = reports.get(token); if (done) resolve(done); else waiting.set(token, resolve); })));
    },
    async report(this: unknown, token: string, result: ChunkReport) {
      assertNoReceiver(this, "report");
      reports.set(token, result);
      waiting.get(token)?.(result);
    },
  };
  return { engine, started, reports };
}

const workflow = Object.assign(async () => {}, { workflowId: "engine-workflow-id" }) as unknown as (input: never) => Promise<unknown>;

test("a list larger than a chunk becomes child runs per phase that share the run, the lease and the ledger", async () => {
  await testDatabase();
  const calls: Call[] = [];
  const restore = stubBlitz(calls);
  process.env.TEST_BLITZ_KEY = "key";
  try {
    const rows = Array.from({ length: 23 }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/p${i}` }));
    const options = { workflow, workflowId: "network-uuid", apiKeyVariable: "TEST_BLITZ_KEY", chunkSize: 5, concurrency: 2, workers: 3 };
    const { engine, started } = fakeEngine(options);
    const summary = (await runNetwork({ ...options, input: { provider: "blitz", rows, maxPeople: 100, maxSpendUsd: 1, requestsPerSecond: 100_000 }, engine })) as Awaited<ReturnType<typeof runSummary>>;
    assert.equal(summary.state, "complete");
    assert.equal(summary.outcomes.find((o) => o.phase === "people" && o.state === "done")?.count, 23);
    assert.equal(summary.outcomes.find((o) => o.phase === "companies" && o.state === "done")?.count, 12);
    // 23 people in chunks of 5 are five children; 12 companies in chunks of 5 are three.
    const people = started.filter((s) => s.chunk?.phase === "people"), companies = started.filter((s) => s.chunk?.phase === "companies");
    assert.equal(people.length, 5);
    assert.equal(companies.length, 3);
    assert.deepEqual(people.map((s) => s.chunk!.items.length), [5, 5, 5, 5, 3]);
    // Every child carried the parent's lease and no rows of its own.
    assert.ok(started.every((s) => s.chunk!.lease.id === "wrun_fixture" && s.chunk!.lease.owner === "wrun_fixture" && s.rows === undefined));
    // Each person and each company was bought exactly once, across all children.
    assert.equal(calls.filter((c) => c.path === "/v2/enrichment/person").length, 23);
    assert.equal(calls.filter((c) => c.path === "/v2/enrichment/company").length, 12);
    const [run] = await db().select().from(profileRuns);
    assert.equal(run.state, "complete");
    assert.equal(run.reserved_micro, 0);
  } finally {
    restore();
  }
});

test("a list within one chunk runs in the parent alone, and a second run reuses fresh work", async () => {
  await testDatabase();
  const calls: Call[] = [];
  const restore = stubBlitz(calls);
  process.env.TEST_BLITZ_KEY = "key";
  try {
    const rows = Array.from({ length: 4 }, (_, i) => ({ profile_url: `https://www.linkedin.com/in/p${i}` }));
    const options = { workflow, workflowId: "network-uuid", apiKeyVariable: "TEST_BLITZ_KEY", chunkSize: 100 };
    const { engine, started } = fakeEngine(options);
    const input = { provider: "blitz" as const, rows, maxPeople: 100, maxSpendUsd: 1, requestsPerSecond: 100_000 };
    const first = (await runNetwork({ ...options, input, engine })) as Awaited<ReturnType<typeof runSummary>>;
    assert.equal(first.state, "complete");
    assert.equal(started.length, 0, "no children for a list within one chunk");
    assert.equal(calls.length, 4 + 2);
    const person = await getProfile(db(), "people", (await db().execute("SELECT key FROM gtm.people LIMIT 1")).rows[0].key as string);
    assert.equal(person?.enrichment_status, "enriched");
    // The same run id is this fixture's run id, so the second run is a resume of a complete run: nothing bought.
    const again = (await runNetwork({ ...options, input, engine })) as Awaited<ReturnType<typeof runSummary>>;
    assert.equal(again.state, "complete");
    assert.equal(calls.length, 6);
  } finally {
    restore();
  }
});
