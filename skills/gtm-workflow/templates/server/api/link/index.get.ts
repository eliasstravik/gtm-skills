import { defineHandler } from "nitro";
import { apiAccess } from "../../../lib/route-access";
import { viewerLink } from "../../../lib/viewer-link";
import { viewerHeaders } from "../../../lib/viewer-access";
export default defineHandler(async (event) =>
  (await apiAccess(event.req))
    ? Response.json(viewerLink(event.req), { headers: viewerHeaders })
    : new Response("Unauthorized", { status: 401, headers: viewerHeaders }),
);
