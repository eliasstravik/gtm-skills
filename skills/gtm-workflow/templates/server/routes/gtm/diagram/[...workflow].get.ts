// gtm-lib v17
import { defineEventHandler } from "nitro/h3";
import { diagramPage } from "../../../../lib/diagram-page";
import { resolveDiagramRequest } from "../../../../lib/diagram-route";

export default defineEventHandler(async (event) => {
  const resolved = await resolveDiagramRequest(event as any);
  if (!resolved.ok) return resolved.response;
  const html = diagramPage({
    path: resolved.claims.path,
    label: resolved.laidOut.workflow.label,
    search: resolved.search,
    origin: resolved.origin,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
});
