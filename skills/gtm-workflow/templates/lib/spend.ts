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

/** Whether `addMicro` more fits under today's cap. In warn mode it always fits, and passing the cap is recorded. */
export async function spendFits(db: Sql, addMicro = 0) {
  const spent = await db.execute({ sql: "SELECT used FROM usage_budget WHERE scope = ?", args: [spendScope()] });
  const used = Number(spent.rows[0]?.used ?? 0);
  const cap = micro(Number(await readSetting(db, "spend_usd_per_day")));
  const over = addMicro ? used + addMicro > cap : used >= cap;
  const message = `Paid-call cap for the day is spent: spend_usd_per_day allows ${cap / 1e6} US dollars and ${used / 1e6} of ${cap / 1e6} is used. The workspace owner can raise spend_usd_per_day in gtm_settings (PUT /api/settings). See references/cost.md.`;
  if (!over) return { fits: true, message };
  if ((await readSetting(db, "guard_mode")) !== "warn") return { fits: false, message };
  const now = new Date().toISOString();
  await db.execute({
    sql: "INSERT INTO guard_log (kind, scope, shape, tables, would_charge, hits, first_at, last_at) VALUES ('spend', ?, ?, '', ?, 1, ?, ?) ON CONFLICT(kind, scope, shape) DO UPDATE SET hits = hits + 1, would_charge = excluded.would_charge, last_at = excluded.last_at",
    args: [spendScope(), `over ${cap / 1e6} USD`, used, now, now],
  });
  return { fits: true, message };
}

/** Stops a run before it starts paying when the day's cap is already used up. */
export async function assertSpendAllowed(db: Sql) {
  const { fits, message } = await spendFits(db);
  if (!fits) throw new Error(message);
}
