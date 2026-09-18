import { defineHandler } from "nitro";
import { rawClient } from "../../lib/db";
import { BudgetExceededError } from "../../lib/db-guard";
import { bearerOk } from "../../lib/sign";

/**
 * Read the result tables: POST { sql, args? } with bearer GTM_RUN_SECRET returns { columns, rows, truncated }.
 * Read-only in three layers: the statement must start as a SELECT, WITH, EXPLAIN, or PRAGMA table_info and carry no
 * write keyword and no second statement; it runs with PRAGMA query_only where the engine honours it (the local file;
 * Turso's server refuses that pragma); and it runs inside a transaction that is always rolled back, so a write that
 * slipped both checks changes nothing. Rows are capped at 1,000; `truncated` says when more exist.
 *
 * Every statement runs through the guard as a one-off question: it may scan, but each scan is charged to a row-read
 * budget (Turso bills every row scanned). The budget is per conversation when the caller sends `x-gtm-conversation`,
 * else one shared budget per day. `usage` reports the estimated rows this statement cost and what is left; a spent
 * budget answers 429. The workspace owner changes the budgets in gtm_settings (references/cost.md).
 */
const MAX_ROWS = 1000;
const READ_ONLY = /^\s*(select|with|explain|pragma\s+(table_info|table_list|index_list|index_info))\b/i;
const WRITE_WORDS = /\b(insert|update|delete|replace|create|drop|alter|attach|detach|vacuum|reindex|begin|commit|rollback|savepoint|release)\b/i;

export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const body = (await event.req.json().catch(() => null)) as { sql?: unknown; args?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql.trim().replace(/;\s*$/, "") : "";
  const args = Array.isArray(body?.args) ? body.args.map((a) => (typeof a === "string" || typeof a === "number" || a === null ? a : String(a))) : [];
  if (!sql) return new Response("Give sql, one read-only statement", { status: 400 });
  if (!READ_ONLY.test(sql) || sql.includes(";") || WRITE_WORDS.test(sql)) return new Response("Only one read-only SELECT, WITH, EXPLAIN, or PRAGMA table_info statement is allowed", { status: 400 });
  const client = rawClient({ interactive: "agent", conversation: event.req.headers.get("x-gtm-conversation") });
  const tx = await client.transaction("read");
  try {
    await tx.execute("PRAGMA query_only = ON").catch(() => undefined);
    const result = await tx.execute({ sql, args });
    const rows = result.rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(result.columns.map((c, i) => [c, r[i]])));
    const budget = await client.budget();
    return { columns: result.columns, rows, truncated: result.rows.length > MAX_ROWS, usage: { rows: client.lastCharge(), ...budget } };
  } catch (error) {
    if (error instanceof BudgetExceededError) return new Response(error.message, { status: 429 });
    return new Response(`The statement was refused: ${error instanceof Error ? error.message : String(error)}`, { status: 400 });
  } finally {
    await tx.rollback().catch(() => undefined);
    await client.flush().catch(() => undefined);
    client.close();
  }
});
