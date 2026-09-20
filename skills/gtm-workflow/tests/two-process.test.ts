// The ledger and the profile store were written for a database with one writer at a time. Two real processes,
// each with its own pool, prove the write lock restores it. Run through Neon's pooler in the Neon check.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { closeDb, db } from "../templates/lib/db";
import { beginRun, reserve, runSummary } from "../templates/lib/profiles/ledger";
import { resolveIdentity } from "../templates/lib/profiles/store";
import { testDatabase } from "./db";

const lease = { id: "two-process-run", owner: "two-process-run" };
const role = process.env.GTM_TWO_PROCESS_ROLE;

if (role) {
  // A worker: this same bundle, started by the test below. Ten tasks at once, then report and leave.
  const tasks = Array.from({ length: 10 }, (_, i) =>
    role === "reserve"
      ? reserve(db(), lease, `entity-${process.env.GTM_TWO_PROCESS_NAME}-${i}`, "fixture:/lookup:default", 1).then((result) => result.status)
      : resolveIdentity(db(), "people", { linkedin_url: "linkedin.com/in/the-same-new-person" }).then((result) => (result.status === "resolved" ? result.profile.key : result.status)),
  );
  const results = await Promise.all(tasks);
  await closeDb();
  console.log(JSON.stringify(results));
  process.exit(0);
}

let database: Awaited<ReturnType<typeof testDatabase>>;
before(async () => { database = await testDatabase(); });
after(closeDb);

function worker(kind: "reserve" | "resolve", name: string) {
  return new Promise<string[]>((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1]], { env: { ...process.env, GTM_TWO_PROCESS_ROLE: kind, GTM_TWO_PROCESS_NAME: name, NODE_TEST_CONTEXT: "" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { err += data; });
    child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(out.trim().split("\n").pop()!)) : reject(new Error(err || `worker exited with ${code}`))));
  });
}

test("twenty reservations from two processes never exceed the budget", async () => {
  // Seven dollars, one dollar each: exactly seven of twenty may be reserved, whoever asks first.
  assert.equal((await beginRun(db(), { ...lease, workflowId: "fixture", budgetUsd: 7, input: [], omitted: 0 })).status, "running");
  const results = (await Promise.all([worker("reserve", "a"), worker("reserve", "b")])).flat();
  assert.equal(results.length, 20);
  assert.equal(results.filter((status) => status === "reserved").length, 7);
  assert.equal(results.filter((status) => status === "budget_deferred").length, 13);
  assert.equal((await runSummary(db(), lease.id)).uncertainSpendUsd, 7);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.profile_attempts")).rows[0].n, 7);
});

test("twenty resolutions of the same new person from two processes create one record", async () => {
  const keys = (await Promise.all([worker("resolve", "a"), worker("resolve", "b")])).flat();
  assert.equal(keys.length, 20);
  assert.equal(new Set(keys).size, 1, `expected one person, got ${[...new Set(keys)].join(", ")}`);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.people")).rows[0].n, 1);
  assert.equal((await database.query("SELECT count(*)::int AS n FROM gtm.profile_identifiers WHERE namespace = 'linkedin_url'")).rows[0].n, 1);
});

test("a burst of 100 writes completes, and its rate is printed", async () => {
  // Phase 6 reads this number on Neon: every write is several round trips behind one lock, so a burst is serial.
  // Locally a transaction is about a millisecond; the queue in lib/db.ts is what keeps a slow one from failing others.
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) => resolveIdentity(db(), "people", { linkedin_url: `linkedin.com/in/burst-${i}` })));
  const elapsed = Date.now() - started;
  assert.ok(results.every((result) => result.status === "resolved"));
  console.log(`# burst: 100 identity resolutions in ${elapsed} ms (${(elapsed / 100).toFixed(1)} ms each) on ${new URL(process.env.DATABASE_URL!).host}`);
});
