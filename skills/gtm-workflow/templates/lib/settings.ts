import type { Client } from "@libsql/client";
import { settingDefaults, type SettingKey } from "./db-guard";

/**
 * The one place a workspace owner changes the database guard's mode and every budget and cap, with no code change
 * and no deploy: rows in gtm_settings, edited through GET/PUT /api/settings or plain SQL. A missing row means the
 * default. A running server picks a change up within a minute (references/cost.md).
 */
type Sql = Pick<Client, "execute">;
export const settingDescriptions: Record<SettingKey, string> = {
  guard_mode: "enforce refuses full table scans and stops work over budget; warn only records both in guard_log.",
  rows_per_run: "Estimated rows one workflow run may read before it stops. A run raises its own with maxRowsRead.",
  rows_per_run_ceiling: "The most a single run may raise its own row-read budget to with maxRowsRead.",
  rows_per_conversation: "Estimated rows one agent conversation (x-gtm-conversation) may read through /api/query.",
  rows_per_day_agent: "Estimated rows per day for agent questions sent without a conversation id, shared.",
  rows_per_statement: "The largest scan, in estimated rows, one interactive statement may make.",
  rows_per_day_browsing: "Estimated rows per day for people browsing the Data pages and shared viewers.",
  rows_per_day_workspace: "Estimated rows per day for the whole workspace, all of the above together.",
  spend_usd_per_day: "US dollars of paid API calls the workspace may make per day, across all runs.",
};
const keys = Object.keys(settingDefaults) as SettingKey[];

/** The most the shared bearer may raise a budget to; above it, and for the settings not listed, only the owner. */
const bearerCeilings: Partial<Record<SettingKey, number>> = {
  rows_per_conversation: 500_000,
  rows_per_day_agent: 500_000,
  rows_per_statement: 200_000,
  rows_per_day_browsing: 5_000_000,
  rows_per_day_workspace: 10_000_000,
};
/** Who is changing a setting: the shared GTM_RUN_SECRET bearer (the hosted agent holds it), or GTM_OWNER_SECRET. */
export type Credential = "bearer" | "owner";

export async function listSettings(db: Sql) {
  const saved = await db.execute({
    sql: `SELECT key, value FROM gtm_settings WHERE key IN (${keys.map(() => "?").join(",")})`,
    args: keys,
  });
  const values = new Map(saved.rows.map((r) => [String(r.key), String(r.value)]));
  const value = (key: SettingKey) => values.get(key) ?? settingDefaults[key];
  return keys.map((key) => ({
    key,
    value: value(key),
    // rows_per_run never exceeds its ceiling, whatever was saved.
    effective: key === "rows_per_run" ? String(Math.min(Number(value(key)), Number(value("rows_per_run_ceiling")))) : value(key),
    default: settingDefaults[key],
    isDefault: !values.has(key),
    ownerOnlyAbove: key === "rows_per_run" ? "rows_per_run_ceiling" : key in bearerCeilings ? String(bearerCeilings[key]) : key === "guard_mode" ? "warn" : "any raise",
    description: settingDescriptions[key],
  }));
}

export async function readSetting(db: Sql, key: SettingKey) {
  const saved = await db.execute({ sql: "SELECT value FROM gtm_settings WHERE key = ?", args: [key] });
  return saved.rows[0] ? String(saved.rows[0].value) : settingDefaults[key];
}

/**
 * Set one setting; null restores its default. The shared bearer may lower anything and raise an ordinary budget up
 * to its ceiling. What would switch the control off needs the owner: guard_mode warn, any raise of
 * rows_per_run_ceiling or spend_usd_per_day, and a budget above its ceiling. rows_per_run never passes
 * rows_per_run_ceiling for anyone; raise the ceiling first. Every change is recorded in settings_log.
 */
export async function writeSetting(db: Sql, key: SettingKey, value: string | number | null, credential: Credential = "bearer") {
  if (!Object.hasOwn(settingDefaults, key)) throw new Error(`Unknown setting ${key}. Settings: ${keys.join(", ")}`);
  const text = value === null ? settingDefaults[key] : String(value).trim();
  if (key === "guard_mode") {
    if (text !== "warn" && text !== "enforce") throw new Error("guard_mode is warn or enforce");
  } else if (key === "spend_usd_per_day") {
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("spend_usd_per_day is a number of US dollars, zero or more");
  } else if (!/^\d+$/.test(text)) throw new Error(`${key} is a whole number of rows, zero or more`);
  const old = await readSetting(db, key);
  const needsOwner = `${key} = ${text} needs the owner secret: send x-gtm-owner-secret with GTM_OWNER_SECRET, or change it with SQL (references/cost.md).`;
  if (key === "guard_mode") {
    if (text === "warn" && old !== "warn" && credential !== "owner") throw new Error(needsOwner);
  } else {
    const raised = Number(text) > Number(old);
    if (key === "rows_per_run" && Number(text) > Number(await readSetting(db, "rows_per_run_ceiling")))
      throw new Error("rows_per_run cannot pass rows_per_run_ceiling; the owner raises the ceiling first");
    const ceiling = key === "rows_per_run" ? Infinity : (bearerCeilings[key] ?? 0);
    if (raised && credential !== "owner" && Number(text) > ceiling) throw new Error(needsOwner);
  }
  const now = new Date().toISOString();
  if (value === null) await db.execute({ sql: "DELETE FROM gtm_settings WHERE key = ?", args: [key] });
  else
    await db.execute({
      sql: "INSERT INTO gtm_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      args: [key, text, now],
    });
  await db.execute({
    sql: "INSERT INTO settings_log (at, key, old_value, new_value, credential) VALUES (?,?,?,?,?)",
    args: [now, key, old, text, credential],
  });
}

/** What GET /api/settings answers: the settings, today's usage, and the last 30 days of guard_log and changes. All index searches. */
export async function settingsReport(db: Sql) {
  const day = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const usage = await db.execute({
    sql: "SELECT scope, used, cap, updated_at FROM usage_budget WHERE scope IN (?,?,?,?)",
    args: [`day:${day}`, `agent-day:${day}`, `browse:${day}`, `spend:${day}`],
  });
  const log = await db.execute({
    sql: "SELECT kind, scope, tables, would_charge, hits, first_at, last_at, shape FROM guard_log WHERE last_at >= ? ORDER BY last_at DESC LIMIT 200",
    args: [since],
  });
  const changes = await db.execute({
    sql: "SELECT at, key, old_value, new_value, credential FROM settings_log WHERE at >= ? ORDER BY at DESC LIMIT 100",
    args: [since],
  });
  return { settings: await listSettings(db), usage: usage.rows, log: log.rows, changes: changes.rows };
}
