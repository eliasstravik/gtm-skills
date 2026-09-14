import { defineHandler } from "nitro";
import { rawClient } from "../../lib/db";
import { bearerOk } from "../../lib/sign";

/**
 * Read the result tables: POST { sql, args? } with bearer GTM_RUN_SECRET returns { columns, rows, truncated }.
 * One read-only statement (SELECT, WITH, EXPLAIN, PRAGMA table_info and friends); anything else is refused, so
 * the caller needs no database token of its own. Rows are capped at 1,000; `truncated` says when more exist.
 */
const MAX_ROWS = 1000;
const READ_ONLY = /^\s*(select|with|explain|pragma\s+(table_info|table_list|index_list|index_info))\b/i;

export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const body = (await event.req.json().catch(() => null)) as { sql?: unknown; args?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql.trim().replace(/;\s*$/, "") : "";
  const args = Array.isArray(body?.args) ? (body.args as (string | number | null)[]) : [];
  if (!sql) return new Response("Give sql, one read-only statement", { status: 400 });
  if (!READ_ONLY.test(sql) || sql.includes(";")) return new Response("Only one SELECT, WITH, EXPLAIN, or PRAGMA table_info statement is allowed", { status: 400 });
  const result = await rawClient().execute({ sql, args });
  const rows = result.rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]])));
  return { columns: result.columns, rows, truncated: result.rows.length > MAX_ROWS };
});
