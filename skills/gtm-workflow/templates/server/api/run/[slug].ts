import { defineHandler } from "nitro";
import { start } from "workflow/api";
import { viewerAttributes } from "../../../lib/viewer-provenance";
import { apiAccess } from "../../../lib/route-access";
import { workflows } from "../../../workflows";
import { findWorkflow } from "../../../lib/workflow-registry";

/**
 * Start a run. POST: input = { ...defaultInput, ...body }. Returns { id }. GET is Vercel Cron's form (input =
 * defaultInput, CRON_SECRET) and exists only on Vercel: locally a GET never starts anything, so no link or image on
 * another web page can start a run on this computer. Access: see lib/route-access.ts (from a laptop:
 * `vercel curl /api/run/<slug> -- -X POST`).
 */
export default defineHandler(async (event) => {
  const isGet = event.req.method === "GET";
  if (isGet && !process.env.VERCEL) return new Response("POST to start a run", { status: 405, headers: { allow: "POST" } });
  if (!(await apiAccess(event.req, { cron: isGet })))
    return new Response("Unauthorized", { status: 401 });
  const slug = event.context.params?.slug ?? "";
  const wf = findWorkflow(workflows, slug);
  if (!wf) return new Response(`Unknown workflow ${slug}`, { status: 404 });
  const body = isGet ? {} : await event.req.json().catch(() => ({}));
  const run = await start(
    wf.run as never,
    [{ ...wf.defaultInput, ...body }] as never,
    { attributes: viewerAttributes(slug) },
  );
  return { id: run.runId };
});
