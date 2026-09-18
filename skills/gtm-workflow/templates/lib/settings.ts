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

export async function listSettings(db: Sql) {
  const saved = await db.execute({
    sql: `SELECT key, value FROM gtm_settings WHERE key IN (${keys.map(() => "?").join(",")})`,
    args: keys,
  });
  const values = new Map(saved.rows.map((r) => [String(r.key), String(r.value)]));
  return keys.map((key) => ({
    key,
    value: values.get(key) ?? settingDefaults[key],
    default: settingDefaults[key],
    isDefault: !values.has(key),
    description: settingDescriptions[key],
  }));
}

export async function readSetting(db: Sql, key: SettingKey) {
  const saved = await db.execute({ sql: "SELECT value FROM gtm_settings WHERE key = ?", args: [key] });
  return saved.rows[0] ? String(saved.rows[0].value) : settingDefaults[key];
}

/** Set one setting; null restores its default. */
export async function writeSetting(db: Sql, key: SettingKey, value: string | number | null) {
  if (!Object.hasOwn(settingDefaults, key)) throw new Error(`Unknown setting ${key}. Settings: ${keys.join(", ")}`);
  if (value === null) {
    await db.execute({ sql: "DELETE FROM gtm_settings WHERE key = ?", args: [key] });
    return;
  }
  const text = String(value).trim();
  if (key === "guard_mode") {
    if (text !== "warn" && text !== "enforce") throw new Error("guard_mode is warn or enforce");
  } else if (key === "spend_usd_per_day") {
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error("spend_usd_per_day is a number of US dollars, zero or more");
  } else if (!/^\d+$/.test(text)) throw new Error(`${key} is a whole number of rows, zero or more`);
  await db.execute({
    sql: "INSERT INTO gtm_settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    args: [key, text, new Date().toISOString()],
  });
}
