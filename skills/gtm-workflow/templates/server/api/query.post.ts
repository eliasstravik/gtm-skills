import { defineHandler } from "nitro";
import { runReadOnly } from "../../lib/db";
import { READ_BUDGETS } from "../../lib/read-budgets";
import { bearerOk } from "../../lib/sign";

/**
 * Read the database: POST { sql, args? } with bearer GTM_RUN_SECRET returns { columns, rows, truncated }.
 * One Postgres statement, parameters as $1, $2, …. Postgres keeps it read-only, not a filter on the text: see
 * runReadOnly in lib/db.ts. The statement has 5 seconds. The rows that leave the database are capped at 1,000 and
 * at 2 MB (lib/read-budgets.ts), whatever the statement says; `truncated` says when more exist, so name columns
 * and add LIMIT.
 */
const LIMITS = { rows: READ_BUDGETS.queryRouteRows, bytes: READ_BUDGETS.queryRouteBytes };

export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const body = (await event.req.json().catch(() => null)) as { sql?: unknown; args?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql.trim() : "";
  const args = Array.isArray(body?.args) ? body.args.map((a) => (typeof a === "string" || typeof a === "number" || typeof a === "boolean" || a === null ? a : String(a))) : [];
  if (!sql) return new Response("Give sql, one read-only statement", { status: 400 });
  try {
    return await runReadOnly(sql, args, LIMITS);
  } catch (error) {
    return new Response(`The statement was refused: ${error instanceof Error ? error.message : String(error)}`, { status: 400 });
  }
});
