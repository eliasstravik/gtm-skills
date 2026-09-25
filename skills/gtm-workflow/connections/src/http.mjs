import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, requireThat, safeError } from "./errors.mjs";
export const securityHeaders = {
  "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
export function createHandler({ mode, origin, manager, production, auth, publicDirectory, ready = true }) {
  return async (request, peer) => {
    let response;
    try {
      requireThat(mode === "local", "local_manager_required", 403);
      auth.boundary(request, peer);
      const path = new URL(request.url).pathname;
      if (path === "/api/health" && request.method === "GET") {
        if (ready) await auth.authorize(request);
        response = Response.json({ status: ready ? "configured" : "setup_needed" });
      }
      else if (path === "/" && request.method === "GET") response = new Response(await readFile(join(publicDirectory, "index.html")), { headers: { "content-type": "text/html; charset=utf-8" } });
      else if (/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path) && request.method === "GET") {
        const extension = path.split(".").pop(), types = { js: "text/javascript", css: "text/css", woff2: "font/woff2" };
        requireThat(types[extension], "not_found", 404);
        response = new Response(await readFile(join(publicDirectory, path.slice(1))), { headers: { "content-type": types[extension] } });
      } else {
        requireThat(ready, "setup_needed", 503);
        if (mode === "local" && path === "/api/session" && request.method === "POST") {
          const body = await readJson(request); response = Response.json(auth.exchange(body.bootstrap));
        } else {
          const principal = await auth.authorize(request);
          if (path === "/api/session" && request.method === "GET") response = Response.json({ csrf: principal.csrf, write: principal.write, mode });
          else if (path === "/api/logout" && request.method === "POST") {
            const cookie = await auth.logout(request); response = Response.json({ signedOut: true }, { headers: cookie ? { "set-cookie": cookie } : {} });
          } else if (path === "/api/connections" && request.method === "GET") response = Response.json({ ...await manager.inventory(), canWrite: principal.write });
          else if (path === "/api/connections" && request.method === "POST") {
            requireThat(principal.write, "read_only", 403);
            response = Response.json(await manager.change(await readJson(request), principal.actor));
          } else if (path === "/api/production" && request.method === "GET") {
            // Hints only: offline, signed out of the Vercel CLI or not linked, the tab just shows no hints.
            response = Response.json(production ? await production.names().catch(() => ({ linked: true, unavailable: true })) : { linked: false });
          } else if (path === "/api/production/push" && request.method === "POST") {
            requireThat(principal.write && production, "read_only", 403);
            response = Response.json(await production.push(await readJson(request)));
          } else requireThat(false, "not_found", 404);
        }
      }
    } catch (error) {
      const safe = safeError(error); response = Response.json({ error: safe.error }, { status: safe.status });
    }
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    return response;
  };
}
