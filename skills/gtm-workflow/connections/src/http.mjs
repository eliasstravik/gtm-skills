import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, requireThat, safeError } from "./errors.mjs";
export const securityHeaders = {
  "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
export function createHandler({ mode, origin, manager, auth, publicDirectory, ready = true, installationId, projectId, verification }) {
  return async (request, peer) => {
    let response;
    try {
      if (mode === "local") auth.boundary(request, peer);
      else requireThat(new URL(request.url).origin === origin && new URL(request.url).protocol === "https:", "origin_denied", 403);
      const path = new URL(request.url).pathname;
      if (path === "/api/health" && request.method === "GET") {
        if (ready) await auth.authorize(request);
        response = Response.json({ status: ready ? "configured" : "setup_needed", ...(ready ? { installationId, projectId } : {}) });
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
        } else if (mode === "production" && path === "/auth/login" && request.method === "GET") response = await auth.login();
        else if (mode === "production" && path === "/auth/callback" && request.method === "GET") response = await auth.callback(request);
        else {
          const principal = await auth.authorize(request);
          if (path === "/api/session" && request.method === "GET") response = Response.json({ csrf: principal.csrf, write: principal.write, mode });
          else if (path === "/api/verification" && request.method === "GET" && verification) {
            requireThat(principal.role === "OWNER", "owner_verification_required", 403);
            response = Response.json(await verification(principal));
          }
          else if (path === "/api/logout" && request.method === "POST") {
            const cookie = await auth.logout(request); response = Response.json({ signedOut: true }, { headers: cookie ? { "set-cookie": cookie } : {} });
          } else if (path === "/api/connections" && request.method === "GET") response = Response.json({ ...await manager.inventory(), canWrite: principal.write, canVerify: mode === "production" && principal.role === "OWNER" });
          else if (path === "/api/connections" && request.method === "POST") {
            requireThat(principal.write, "read_only", 403);
            response = Response.json(await manager.change(await readJson(request), principal.actor));
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
