import { defineHandler } from "nitro";
import { connectionConfiguration, connectionHeaders, privateConnectionBrowser } from "../../lib/connections-access";
import { openLocalConnections } from "../../lib/connections-local";
export default defineHandler(async (event) => {
  // `npm run dev` serves this folder too; locally the tab signs in to the Connections manager the launcher started.
  if (!process.env.VERCEL) return openLocalConnections(event.req);
  try {
    await privateConnectionBrowser(event.req, connectionConfiguration());
    return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connections</title><link rel="stylesheet" href="/connections-assets/app.css"></head><body><div id="root" data-integrated="true"></div><script type="module" src="/connections-assets/app.js"></script></body></html>', {
      headers: { ...connectionHeaders, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" },
    });
  } catch { return new Response("Connections require your private Vercel browser session and completed project setup.", { status: 403, headers: connectionHeaders }); }
});
