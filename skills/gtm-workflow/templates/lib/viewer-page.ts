import { page } from "../viewer/shell";
import { viewerHeaders, privateAccess } from "./viewer-access";
export function viewerPage(req: Request) {
  try {
    privateAccess(req);
  } catch {
    return new Response("Private viewer unavailable.", {
      status: 503,
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
