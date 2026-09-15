import { defineHandler } from "nitro";
import { bearerOk } from "../../../lib/sign";
import { viewerLink } from "../../../lib/viewer-link";
import { viewerHeaders } from "../../../lib/viewer-access";
export default defineHandler((event) => {
  if (!bearerOk(event.req))
    return new Response("Unauthorized", {
      status: 401,
      headers: viewerHeaders,
    });
  try {
    return Response.json(viewerLink(event.req, event.context.params?.slug), {
      headers: viewerHeaders,
    });
  } catch {
    return new Response("Workflow unavailable", {
      status: 404,
      headers: viewerHeaders,
    });
  }
});
