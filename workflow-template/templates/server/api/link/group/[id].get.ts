import { defineHandler } from "nitro";
import { apiAccess } from "../../../../lib/route-access";
import { groupLink } from "../../../../lib/viewer-link";
import { viewerHeaders } from "../../../../lib/viewer-access";
export default defineHandler(async (event) => {
  if (!(await apiAccess(event.req)))
    return new Response("Unauthorized", { status: 401, headers: viewerHeaders });
  const link = groupLink(event.req, event.context.params?.id ?? "");
  return link
    ? Response.json(link, { headers: viewerHeaders })
    : new Response("Group unavailable", { status: 404, headers: viewerHeaders });
});
