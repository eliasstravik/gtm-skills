import { defineHandler } from "nitro";
import { bearerOk } from "../../../lib/sign";
import { viewerLink, intakeUrl } from "../../../lib/viewer-link";
import { viewerHeaders } from "../../../lib/viewer-access";
import { workflows } from "../../../workflows";
export default defineHandler((event) => {
  if (!bearerOk(event.req))
    return new Response("Unauthorized", {
      status: 401,
      headers: viewerHeaders,
    });
  const slug = event.context.params?.slug;
  try {
    const hasIntake = Boolean((workflows[slug as keyof typeof workflows] as { intake?: unknown } | undefined)?.intake);
    return Response.json({ ...viewerLink(event.req, slug), ...(hasIntake ? { intakeUrl: intakeUrl(slug!) } : {}) }, {
      headers: viewerHeaders,
    });
  } catch {
    return new Response("Workflow unavailable", {
      status: 404,
      headers: viewerHeaders,
    });
  }
});
