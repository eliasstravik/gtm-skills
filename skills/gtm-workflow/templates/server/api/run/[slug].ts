import { defineHandler } from "nitro";
import { start } from "workflow/api";
import { bearerOk } from "../../../lib/sign";
import { workflows } from "../../../workflows";

/**
 * Start a run. GET: cron, input = defaultInput (bearer GTM_RUN_SECRET or CRON_SECRET).
 * POST: manual, input = { ...defaultInput, ...body } (bearer GTM_RUN_SECRET). Returns { id }.
 */
export default defineHandler(async (event) => {
  const isGet = event.req.method === "GET";
  if (!bearerOk(event.req, isGet)) return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  const wf = workflows[slug as keyof typeof workflows];
  if (!wf) return new Response(`Unknown workflow ${slug}`, { status: 404 });
  const body = isGet ? {} : await event.req.json().catch(() => ({}));
  const run = await start(wf.run as never, [{ ...wf.defaultInput, ...body }] as never);
  return { id: run.runId };
});
