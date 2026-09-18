import { defineHandler } from "nitro";
import { rawClient } from "../../lib/db";
import { settingsReport, writeSetting } from "../../lib/settings";
import type { SettingKey } from "../../lib/db-guard";
import { bearerOk, ownerOk } from "../../lib/sign";

/**
 * The controls for the database guard, with bearer GTM_RUN_SECRET. No deploy is needed; a running server picks a
 * change up within a minute. This route always works: it reads and writes by key on the runtime's own client, which
 * a spent budget never stops, so a spent budget cannot lock the owner out of raising it.
 * GET: every setting with its value, default and meaning, today's usage per budget, the latest guard_log rows (what
 * the guard refused, or in warn mode would have refused) and the latest changes.
 * PUT { key, value }: set one setting; value null restores the default. The bearer may lower anything, raise
 * rows_per_run up to rows_per_run_ceiling, and raise the other row budgets except rows_per_day_workspace to at most
 * twice their default. Setting guard_mode to warn, raising rows_per_day_workspace, rows_per_run_ceiling or
 * spend_usd_per_day, and passing a limit also need header x-gtm-owner-secret (GTM_OWNER_SECRET), which the hosted
 * agent never holds. Every change is recorded in settings_log. Change one only when the owner asks for it.
 */
export default defineHandler(async (event) => {
  if (!bearerOk(event.req)) return new Response("Unauthorized", { status: 401 });
  const client = rawClient();
  try {
    if (event.req.method === "PUT") {
      const body = (await event.req.json().catch(() => null)) as { key?: unknown; value?: unknown } | null;
      const value = body?.value;
      if (typeof body?.key !== "string" || !(value === null || typeof value === "string" || typeof value === "number"))
        return new Response("Give { key, value }; value null restores the default", { status: 400 });
      try {
        await writeSetting(client, body.key as SettingKey, value, ownerOk(event.req) ? "owner" : "bearer");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: /owner secret/.test(message) ? 403 : 400 });
      }
    } else if (event.req.method !== "GET") return new Response("GET or PUT", { status: 405 });
    return await settingsReport(client);
  } finally {
    await client.flush().catch(() => undefined);
    client.close();
  }
});
