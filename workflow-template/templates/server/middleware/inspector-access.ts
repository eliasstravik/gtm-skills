import { defineHandler } from "nitro";
import { privateAccess, tailnetRequest } from "../../lib/viewer-access";
/**
 * Local only. The Workflow SDK serves its run inspector (`/_workflow`, and the files it loads from `/assets/`) and its
 * run endpoints (`/.well-known/workflow/`) without any access check. On loopback only this computer reaches them, but in
 * tailnet mode Tailscale Serve would hand them to every device on the tailnet. So the inspector admits whom the viewer
 * admits, and the run endpoints, which only this dev server's own queue calls over loopback, refuse the tailnet.
 */
export default defineHandler(async (event) => {
  if (process.env.VERCEL) return undefined;
  const path = event.url.pathname;
  if (path.startsWith("/.well-known/workflow/")) {
    let tailnet: boolean;
    try {
      tailnet = Boolean(tailnetRequest(event.req));
    } catch {
      // Half a tailnet setting must not stop this server's own queue; anything not addressed to loopback is refused.
      tailnet = !["127.0.0.1", "localhost", "[::1]"].includes(event.url.hostname);
    }
    return tailnet ? new Response("Not found.", { status: 404 }) : undefined;
  }
  if (path !== "/_workflow" && !path.startsWith("/_workflow/") && !path.startsWith("/assets/")) return undefined;
  try {
    await privateAccess(event.req);
    return undefined;
  } catch (error) {
    return new Response((error as Error).message, { status: (error as { status?: number }).status ?? 403, headers: { "cache-control": "private, no-store" } });
  }
});
