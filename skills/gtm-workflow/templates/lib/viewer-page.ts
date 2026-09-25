import { page } from "../viewer/shell";
import { viewerHeaders, privateAccess } from "./viewer-access";
export async function viewerPage(req: Request) {
  try {
    await privateAccess(req);
  } catch (error) {
    return new Response((error as Error).message || "Private viewer unavailable.", {
      status: (error as { status?: number }).status ?? 503,
      headers: viewerHeaders,
    });
  }
  return new Response(page, {
    headers: {
      ...viewerHeaders,
      "content-type": "text/html; charset=utf-8",
      "content-security-policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    },
  });
}
