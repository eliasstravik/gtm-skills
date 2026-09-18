import type { Client } from "@libsql/client";
import { readSetting } from "./settings";

/**
 * The workspace's paid-call cap per day, across all runs. Per-run caps (runRows.maxSpendUsd, the ledger's run
 * budget) bound one run; this bounds the day. Spend is kept in usage_budget under `spend:<day>` in micro dollars,
 * and the cap is spend_usd_per_day in gtm_settings.
 */
type Sql = Pick<Client, "execute">;
const micro = (usd: number) => Math.ceil(usd * 1e6);
export const spendScope = () => `spend:${new Date().toISOString().slice(0, 10)}`;

export async function chargeSpendMicro(db: Sql, amount: number) {
  if (amount <= 0) return;
  await db.execute({
    sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?,?,NULL,?) ON CONFLICT(scope) DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at",
    args: [spendScope(), amount, new Date().toISOString()],
  });
}
export const chargeSpend = (db: Sql, usd: number) => chargeSpendMicro(db, micro(usd));

async function capMicro(db: Sql) {
  return micro(Number(await readSetting(db, "spend_usd_per_day")));
}
async function overCap(db: Sql, used: number, cap: number) {
  const message = `Paid-call cap for the day is spent: spend_usd_per_day allows ${cap / 1e6} US dollars and ${used / 1e6} of ${cap / 1e6} is used or reserved. The workspace owner can raise spend_usd_per_day (PUT /api/settings with the owner secret). See references/cost.md.`;
  if ((await readSetting(db, "guard_mode")) !== "warn") return { stop: true, message };
  await record(db, "spend", spendScope(), `over ${cap / 1e6} USD`, used);
  return { stop: false, message };
}
async function record(db: Sql, kind: string, scope: string, shape: string, charge: number) {
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO guard_log (kind, scope, shape, tables, would_charge, hits, first_at, last_at) VALUES (?, ?, ?, '', ?, 1, ?, ?) ON CONFLICT(kind, scope, shape) DO UPDATE SET hits = hits + 1, would_charge = excluded.would_charge, last_at = excluded.last_at",
    args: [kind, scope, shape, charge, now, now],
  });
}

/** Whether `addMicro` more fits under today's cap, counting what is already used or reserved. In warn mode it always fits, and passing the cap is recorded. */
export async function spendFits(db: Sql, addMicro = 0) {
  const spent = await db.execute({ sql: "SELECT used FROM usage_budget WHERE scope = ?", args: [spendScope()] });
  const used = Number(spent.rows[0]?.used ?? 0);
  const cap = await capMicro(db);
  if (addMicro ? used + addMicro <= cap : used < cap) return { fits: true, message: "" };
  const over = await overCap(db, used, cap);
  return { fits: !over.stop, message: over.message };
}

/**
 * Take `usd` out of today's cap before paying it. One conditional statement, so parallel runs cannot each see room
 * and all spend it. A run reserves ahead in small amounts and settles the difference when it ends.
 */
export async function reserveSpend(db: Sql, usd: number) {
  const amount = micro(usd);
  const cap = await capMicro(db);
  const now = new Date().toISOString();
  const taken =
    amount <= cap
      ? await db.execute({
          sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?,?,NULL,?) ON CONFLICT(scope) DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at WHERE used + excluded.used <= ? RETURNING used",
          args: [spendScope(), amount, now, cap],
        })
      : { rows: [] };
  if (taken.rows.length) return { ok: true, message: "" };
  const spent = await db.execute({ sql: "SELECT used FROM usage_budget WHERE scope = ?", args: [spendScope()] });
  const over = await overCap(db, Number(spent.rows[0]?.used ?? 0), cap);
  if (!over.stop) await chargeSpendMicro(db, amount);
  return { ok: !over.stop, message: over.message };
}

/** The difference between what a run reserved and what it paid; negative gives the rest back. */
export async function settleSpend(db: Sql, usd: number) {
  const amount = usd < 0 ? -micro(-usd) : micro(usd);
  if (!amount) return;
  await db.execute({
    sql: "UPDATE usage_budget SET used = MAX(0, used + ?), updated_at = ? WHERE scope = ?",
    args: [amount, new Date().toISOString(), spendScope()],
  });
}

/**
 * Stops a run where it starts when the day's paid-call cap or the workspace's row-read budget is used up. The
 * guard never stops a run already in flight for the workspace's day, so this is where a runaway day ends.
 */
export async function assertRunMayStart(db: Sql) {
  const spend = await spendFits(db);
  if (!spend.fits) throw Object.assign(new Error(spend.message), { fatal: true });
  const day = `day:${new Date().toISOString().slice(0, 10)}`;
  const rows = await db.execute({ sql: "SELECT used FROM usage_budget WHERE scope = ?", args: [day] });
  const used = Number(rows.rows[0]?.used ?? 0);
  const cap = Number(await readSetting(db, "rows_per_day_workspace"));
  if (used < cap) return;
  if ((await readSetting(db, "guard_mode")) === "warn") return record(db, "budget", day, `new run over ${cap}`, used);
  throw Object.assign(
    new Error(`The workspace's row-read budget for the day is spent: ${used} of ${cap} estimated rows (rows_per_day_workspace), so no new run starts until tomorrow (UTC). The workspace owner can raise rows_per_day_workspace (PUT /api/settings). See references/cost.md.`),
    { fatal: true },
  );
}
