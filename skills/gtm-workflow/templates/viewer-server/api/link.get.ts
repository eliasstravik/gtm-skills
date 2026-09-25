import { defineHandler } from "nitro";
import { privateAccess, viewerHeaders } from "../../lib/viewer-access";
import { viewerLink } from "../../lib/viewer-link";
export default defineHandler(async (event) => {
  await privateAccess(event.req);
  return Response.json(
    viewerLink(
      event.req,
      new URL(event.req.url).searchParams.get("workflow") ?? undefined,
    ),
    { headers: viewerHeaders },
  );
});
