import { defineHandler } from "nitro";
import { apiAccess } from "../../../lib/route-access";
import { viewerLink, intakeUrl } from "../../../lib/viewer-link";
import { viewerHeaders } from "../../../lib/viewer-access";
import { workflows } from "../../../workflows";
import { findWorkflow } from "../../../lib/workflow-registry";
export default defineHandler(async (event) => {
  if (!(await apiAccess(event.req)))
    return new Response("Unauthorized", {
      status: 401,
      headers: viewerHeaders,
    });
  const slug = event.context.params?.slug;
  try {
    // Only production has the public relay a sender can reach; a local intake URL would point senders at production.
    const hasIntake = process.env.VERCEL_ENV === "production" && Boolean((findWorkflow(workflows, slug ?? "") as { intake?: unknown } | undefined)?.intake);
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
