import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { profileSchemaSql } from "../templates/lib/profiles/schema";
import { ledgerSchemaSql, beginRun, reserve, dispatch, settle } from "../templates/lib/profiles/ledger";
import { guard, guardSchemaSql } from "../templates/lib/db-guard";
import { listSettings, writeSetting } from "../templates/lib/settings";
import { assertSpendAllowed, chargeSpend } from "../templates/lib/spend";

async function database() {
  const inner = createClient({ url: ":memory:" });
  await inner.executeMultiple(profileSchemaSql() + ledgerSchemaSql + guardSchemaSql);
  return { inner, db: guard(inner, { mode: "strict", scope: "run:budget" }) };
}
const lease = { id: "run", owner: "worker" };
const run = (db: Parameters<typeof beginRun>[0]) =>
  beginRun(db, { ...lease, workflowId: "w", budgetUsd: 1000, input: [], omitted: 0 });

test("settings list every budget with its default and accept an owner's change without a deploy", async () => {
  const { db } = await database();
  const before = await listSettings(db);
  assert.deepEqual(
    before.map((s) => [s.key, s.value, s.isDefault]),
    [
      ["guard_mode", "enforce", true],
      ["rows_per_run", "200000", true],
      ["rows_per_run_ceiling", "2000000", true],
      ["rows_per_conversation", "100000", true],
      ["rows_per_day_agent", "100000", true],
      ["rows_per_statement", "50000", true],
      ["rows_per_day_browsing", "1000000", true],
      ["rows_per_day_workspace", "5000000", true],
      ["spend_usd_per_day", "100", true],
    ],
  );
  assert.ok(before.every((s) => s.description.length > 20));
  await writeSetting(db, "spend_usd_per_day", "250");
  await writeSetting(db, "guard_mode", "warn");
  const after = await listSettings(db);
  assert.deepEqual(after.find((s) => s.key === "spend_usd_per_day"), { ...before[8], value: "250", isDefault: false });
  assert.equal(after[0].value, "warn");
  await writeSetting(db, "spend_usd_per_day", null);
  assert.equal((await listSettings(db))[8].isDefault, true);
  await assert.rejects(writeSetting(db, "rows_per_run", "lots"), /whole number/);
  await assert.rejects(writeSetting(db, "guard_mode", "off"), /warn or enforce/);
  await assert.rejects(writeSetting(db, "made_up" as never, "1"), /Unknown setting/);
});

test("the ledger defers a paid call once the day's spend reaches spend_usd_per_day", async () => {
  const { db } = await database();
  await writeSetting(db, "spend_usd_per_day", "0.05");
  await run(db);
  for (const key of ["a", "b"]) {
    const r = await reserve(db, lease, key, "lookup", 0.02);
    assert.equal(r.status, "reserved");
    if (r.status !== "reserved") return;
    await dispatch(db, lease, r.id);
    await settle(db, r.id, 0.02, {});
  }
  // 0.04 settled; 0.02 more would pass 0.05.
  assert.equal((await reserve(db, lease, "c", "lookup", 0.02)).status, "budget_deferred");
  assert.equal((await reserve(db, lease, "c", "lookup", 0.01)).status, "reserved");
  await writeSetting(db, "spend_usd_per_day", "1");
  assert.equal((await reserve(db, lease, "d", "lookup", 0.02)).status, "reserved");
});

test("a row workflow is stopped with a clear error when the day's spend is used up", async () => {
  const { db } = await database();
  await writeSetting(db, "spend_usd_per_day", "2");
  await assertSpendAllowed(db);
  await chargeSpend(db, 2.5);
  await assert.rejects(assertSpendAllowed(db), /spend_usd_per_day.*2\.5.*of 2/s);
});

test("warn mode lets paid work continue and records the day cap it passed", async () => {
  const { db, inner } = await database();
  await writeSetting(db, "guard_mode", "warn");
  await writeSetting(db, "spend_usd_per_day", "0.01");
  await chargeSpend(db, 1);
  await assertSpendAllowed(db);
  await run(db);
  assert.equal((await reserve(db, lease, "a", "lookup", 0.02)).status, "reserved");
  const log = await inner.execute("SELECT kind, hits FROM guard_log WHERE kind = 'spend'");
  assert.equal(log.rows.length, 1);
});
