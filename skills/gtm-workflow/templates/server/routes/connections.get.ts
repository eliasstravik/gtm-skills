import { defineHandler } from "nitro";
import { connectionConfiguration, connectionHeaders, privateConnectionBrowser } from "../../lib/connections-access";
import { privateAccess } from "../../lib/viewer-access";
import { favicon } from "../../viewer/shell";
/** The Keys page. One page for both places: production saves to the project's Production variables, local to `.env.local`. */
export const keysPage = (environment: "local" | "production") => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connections</title>${favicon}<link rel="stylesheet" href="/connections-assets/app.css"></head><body><div id="root" data-environment="${environment}"></div><script type="module" src="/connections-assets/app.js"></script></body></html>`, {
  headers: { ...connectionHeaders, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
});
export default defineHandler(async (event) => {
  if (!process.env.VERCEL) {
    try { await privateAccess(event.req); } catch { return new Response("Local viewer access only.", { status: 403, headers: connectionHeaders }); }
    return keysPage("local");
  }
  try {
    await privateConnectionBrowser(event.req, connectionConfiguration());
    return keysPage("production");
  } catch { return new Response("Connections require your private Vercel browser session and completed project setup.", { status: 403, headers: connectionHeaders }); }
});
