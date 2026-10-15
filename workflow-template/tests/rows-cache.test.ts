// Result rows and the cache on real types: freshness and expiry are judged in SQL, by the database's clock.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { closeDb, db, upsert } from "../templates/lib/db";
import { cached } from "../templates/lib/cache";
import { readFresh, saveRow } from "../templates/lib/rows";
import { listChildren } from "../templates/lib/runs-api";
import { cache } from "../templates/lib/schema/cache";
import { testDatabase } from "./db";

before(async () => { await testDatabase(); });
after(closeDb);

test("fresh keys are chosen in SQL: present, without an error, and young enough", async () => {
  await saveRow("exampleScores", { key: "fresh", cost_usd: 0.01, error: null, score: 7, reason: "fits" });
  await saveRow("exampleScores", { key: "failed", cost_usd: 0, error: "boom", score: null, reason: null });
  await saveRow("exampleScores", { key: "old", cost_usd: 0, error: null, score: 1, reason: "nu\u0000l" });
  await db().execute(sql`UPDATE example_scores SET updated_at = now() - interval '2 days' WHERE key = 'old'`);
  assert.deepEqual(await readFresh("exampleScores", ["fresh", "failed", "old", "missing"], 24 * 60 * 60 * 1000), ["fresh"]);
  assert.deepEqual((await readFresh("exampleScores", ["fresh", "old"], 3 * 24 * 60 * 60 * 1000)).sort(), ["fresh", "old"]);
  assert.deepEqual(await readFresh("exampleScores", [], 1000), []);
  const [row] = (await db().execute(sql`SELECT reason, pg_typeof(updated_at)::text AS type FROM example_scores WHERE key = 'old'`)).rows;
  assert.deepEqual(row, { reason: "nul", type: "timestamp with time zone" });
});

test("the cache stores any JSON value, returns a hit at no cost and refetches after expiry", async () => {
  let calls = 0;
  const fetchPage = () => cached("page", { domain: "example.com" }, 60_000, async () => ({ value: `text ${++calls}`, costUsd: 0.5 }));
  assert.deepEqual(await fetchPage(), { value: "text 1", costUsd: 0.5 });
  assert.deepEqual(await fetchPage(), { value: "text 1", costUsd: 0 });
  assert.deepEqual(await cached("list", 1, 60_000, async () => ({ value: [1, { a: [2] }], costUsd: 0 })), { value: [1, { a: [2] }], costUsd: 0 });
  assert.deepEqual((await cached("list", 1, 60_000, async () => ({ value: [], costUsd: 0 }))).value, [1, { a: [2] }], "an array comes back as the array that went in");
  await db().update(cache).set({ expires_at: new Date(Date.now() - 1000) });
  assert.deepEqual(await fetchPage(), { value: "text 2", costUsd: 0.5 });
  assert.equal(calls, 2);
});

test("child run ids append atomically and are read without duplicates", async () => {
  const record = (ids: string[]) => {
    const now = new Date();
    return db().insert(cache).values({ name: "children", hash: "parent", value: ids, created_at: now, expires_at: new Date(now.getTime() + 60_000) })
      .onConflictDoUpdate({ target: [cache.name, cache.hash], set: { value: sql`${cache.value} || excluded.value` } });
  };
  await Promise.all([record(["a", "b"]), record(["c"]), record(["a", "b"])]);
  assert.deepEqual((await listChildren("parent")).sort(), ["a", "b", "c"]);
  assert.deepEqual(await listChildren("nobody"), []);
  // The same hash under another name is another entry.
  await upsert("cache", [{ name: "approval", hash: "parent", value: { other: true }, created_at: new Date(), expires_at: new Date(Date.now() + 60_000) }], ["name", "hash"]);
  assert.deepEqual((await listChildren("parent")).sort(), ["a", "b", "c"]);
});
