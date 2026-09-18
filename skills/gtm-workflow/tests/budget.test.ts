import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { profileSchemaSql } from "../templates/lib/profiles/schema";
import { ledgerSchemaSql, beginRun, reserve, dispatch, settle } from "../templates/lib/profiles/ledger";
import { guard, guardSchemaSql } from "../templates/lib/db-guard";
import { listSettings, settingsReport, writeSetting } from "../templates/lib/settings";
import { assertRunMayStart, reserveSpend, settleSpend } from "../templates/lib/spend";

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
  await writeSetting(db, "spend_usd_per_day", "250", "owner");
  await writeSetting(db, "guard_mode", "warn", "owner");
  const after = await listSettings(db);
  assert.deepEqual(after.find((s) => s.key === "spend_usd_per_day"), { ...before[8], value: "250", effective: "250", isDefault: false });
  assert.equal(after[0].value, "warn");
  await writeSetting(db, "spend_usd_per_day", null, "owner");
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
  await writeSetting(db, "spend_usd_per_day", "1", "owner");
  assert.equal((await reserve(db, lease, "d", "lookup", 0.02)).status, "reserved");
});

test("parallel runs cannot all pass the day's cap: each reserves its spend before paying", async () => {
  const { db, inner } = await database();
  await writeSetting(db, "spend_usd_per_day", "10", "owner");
  const grants = await Promise.all(Array.from({ length: 5 }, () => reserveSpend(db, 4)));
  assert.equal(grants.filter((g) => g.ok).length, 2);
  assert.match(grants.find((g) => !g.ok)!.message, /spend_usd_per_day/);
  // A run settles what it did not spend, and a failed run's spend still counts.
  await settleSpend(db, -3);
  assert.equal(Number((await inner.execute("SELECT used FROM usage_budget WHERE scope LIKE 'spend:%'")).rows[0].used), 5_000_000);
  assert.equal((await reserveSpend(db, 4)).ok, true);
  assert.equal((await reserveSpend(db, 4)).ok, false);
});

test("a new run is stopped with a clear error once the day's paid-call cap or row budget is used up", async () => {
  const { db, inner } = await database();
  await assertRunMayStart(db);
  await writeSetting(db, "spend_usd_per_day", "2", "owner");
  await reserveSpend(db, 2);
  await assert.rejects(assertRunMayStart(db), /spend_usd_per_day/);
  await writeSetting(db, "spend_usd_per_day", "50", "owner");
  await assertRunMayStart(db);
  await inner.execute({ sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?, 6000000, NULL, 'now')", args: [`day:${new Date().toISOString().slice(0, 10)}`] });
  await assert.rejects(assertRunMayStart(db), (error: unknown) => /rows_per_day_workspace/.test(String(error)) && (error as { fatal?: boolean }).fatal === true);
});

test("warn mode lets paid work continue and records the day cap it passed", async () => {
  const { db, inner } = await database();
  await writeSetting(db, "guard_mode", "warn", "owner");
  await writeSetting(db, "spend_usd_per_day", "0.01");
  assert.equal((await reserveSpend(db, 1)).ok, true);
  await assertRunMayStart(db);
  await run(db);
  assert.equal((await reserve(db, lease, "a", "lookup", 0.02)).status, "reserved");
  const log = await inner.execute("SELECT kind, hits FROM guard_log WHERE kind = 'spend'");
  assert.equal(log.rows.length, 1);
});

test("the shared bearer may lower anything and raise ordinary budgets to their ceilings; the rest needs the owner", async () => {
  const { db, inner } = await database();
  // Lowering, and raising an ordinary budget within its ceiling: the hosted agent may do this on request.
  await writeSetting(db, "spend_usd_per_day", "40");
  await writeSetting(db, "rows_per_run", "500000");
  await writeSetting(db, "rows_per_conversation", "300000");
  await writeSetting(db, "guard_mode", "enforce");
  // What would switch the control off needs the owner secret.
  await assert.rejects(writeSetting(db, "guard_mode", "warn"), /owner secret/);
  await assert.rejects(writeSetting(db, "spend_usd_per_day", "41"), /owner secret/);
  await assert.rejects(writeSetting(db, "spend_usd_per_day", null), /owner secret/);
  await assert.rejects(writeSetting(db, "rows_per_run_ceiling", "3000000"), /owner secret/);
  await assert.rejects(writeSetting(db, "rows_per_run", "2500000"), /rows_per_run_ceiling/);
  await assert.rejects(writeSetting(db, "rows_per_day_workspace", "20000000"), /owner secret/);
  await writeSetting(db, "rows_per_run_ceiling", "300000");
  await writeSetting(db, "rows_per_day_workspace", "20000000", "owner");
  await writeSetting(db, "guard_mode", "warn", "owner");
  // The ceiling is real even for a value saved before it was lowered, or written with SQL.
  assert.equal((await listSettings(db)).find((s) => s.key === "rows_per_run")!.effective, "300000");
  const log = await inner.execute("SELECT key, old_value, new_value, credential FROM settings_log ORDER BY rowid");
  assert.deepEqual(
    log.rows.map((r) => [r.key, r.old_value, r.new_value, r.credential]),
    [
      ["spend_usd_per_day", "100", "40", "bearer"],
      ["rows_per_run", "200000", "500000", "bearer"],
      ["rows_per_conversation", "100000", "300000", "bearer"],
      ["guard_mode", "enforce", "enforce", "bearer"],
      ["rows_per_run_ceiling", "2000000", "300000", "bearer"],
      ["rows_per_day_workspace", "5000000", "20000000", "owner"],
      ["guard_mode", "enforce", "warn", "owner"],
    ],
  );
});

test("a run cannot raise its own budget past the ceiling, even when rows_per_run was saved above it", async () => {
  const { inner } = await database();
  await inner.execute("INSERT INTO gtm_settings (key, value, updated_at) VALUES ('rows_per_run', '9000000', 'now'), ('rows_per_run_ceiling', '50', 'now')");
  const run = guard(inner, { mode: "strict", scope: "run:capped" });
  assert.equal((await run.budget()).cap, 50);
  assert.equal(await run.setRunBudget(9000000), 50);
});

test("a spent workspace day cannot lock the owner out: the settings report and a raise still work", async () => {
  const { inner } = await database();
  const day = `day:${new Date().toISOString().slice(0, 10)}`;
  await inner.execute({ sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?, 99000000, NULL, 'now')", args: [day] });
  await inner.execute("INSERT INTO guard_log VALUES ('scan', 'run:x', 'SELECT 1', 'people', 9, 1, '2026-09-18', '2999-01-01')");
  const agent = guard(inner, { mode: "interactive", scope: "agent:locked" });
  await assert.rejects(agent.execute("SELECT 1 FROM people WHERE key = 'a'"), /rows_per_day_workspace/);
  // The settings route's client: strict, enforcing, scope "system".
  const system = guard(inner, { mode: "strict", scope: "system" });
  const report = await settingsReport(system);
  assert.equal(report.log.length, 1);
  assert.equal(Number(report.usage[0].used), 99000000);
  await writeSetting(system, "rows_per_day_workspace", "200000000", "owner");
  assert.equal((await settingsReport(system)).changes.length, 1);
  const next = guard(inner, { mode: "interactive", scope: "agent:unlocked" });
  assert.equal((await next.execute("SELECT 1 AS one FROM people WHERE key = 'a'")).rows.length, 0);
});
