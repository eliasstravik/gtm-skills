import { defineHandler } from "nitro";
import { rawClient } from "../../lib/db";
import { listSettings, writeSetting } from "../../lib/settings";
import type { SettingKey } from "../../lib/db-guard";
import { bearerOk } from "../../lib/sign";

/**
 * The workspace owner's controls for the database guard, with bearer GTM_RUN_SECRET. No deploy is needed; a running
 * server picks a change up within a minute.
 * GET: every setting with its value, default and meaning, today's usage per budget, and the latest guard_log rows
 * (what the guard refused, or in warn mode would have refused).
 * PUT { key, value }: set one setting; value null restores the default. Change one only when the owner asks for it.
 */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const client = rawClient({ interactive: "agent" });
  try {
    if (event.req.method === "PUT") {
      const body = (await event.req.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
      const value = body?.value;
      if (typeof body?.key !== "string" || !(value === null || typeof value === "string" || typeof value === "number"))
        return new Response("Give { key, value }; value null restores the default", { status: 400 });
      try {
        await writeSetting(client, body.key as SettingKey, value);
      } catch (error) {
        return new Response(error instanceof Error ? error.message : String(error), { status: 400 });
      }
    } else if (event.req.method !== "GET") return new Response("GET or PUT", { status: 405 });
    const day = new Date().toISOString().slice(0, 10);
    const usage = await client.execute({
      sql: "SELECT scope, used, cap, updated_at FROM usage_budget WHERE scope IN (?,?,?,?)",
      args: [`day:${day}`, `agent-day:${day}`, `browse:${day}`, `spend:${day}`],
    });
    const log = await client.execute(
      "SELECT kind, scope, tables, would_charge, hits, first_at, last_at, shape FROM guard_log ORDER BY last_at DESC LIMIT 200",
    );
    return { settings: await listSettings(client), usage: usage.rows, log: log.rows };
  } finally {
    await client.flush().catch(() => undefined);
    client.close();
  }
});
