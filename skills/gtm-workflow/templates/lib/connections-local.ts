import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { request as httpRequest } from "node:http";
import { privateAccess, tailnetMode, tailnetRequest, viewerOrigin } from "./viewer-access";

const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
/** The launcher starts Connections next to the viewer and says where its manager.json is; the manager can restart
 * (`connections open`) without the viewer, so it is looked up at every click, never only at boot. */
export function localConnectionsEnabled(env = process.env) {
  return !env.VERCEL && typeof env.GTM_CONNECTIONS_MANAGER === "string" && env.GTM_CONNECTIONS_MANAGER.endsWith("manager.json");
}
async function manager(path: string) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== "win32" && (stat.mode & 0o077)) || (process.getuid && stat.uid !== process.getuid()))
    throw Error("unsafe manager state");
  const value = JSON.parse(await readFile(path, "utf8"));
  process.kill(value.pid, 0);
  const pipe = process.platform === "win32" ? typeof value.ipcPath === "string" && value.ipcPath.startsWith("\\\\.\\pipe\\gtm-connections-")
    : typeof value.ipcPath === "string" && value.ipcPath.startsWith(join(dirname(path), "m-"));
  if (!pipe || typeof value.ipcToken !== "string" || !/^[a-f0-9]{64}$/.test(value.ipcToken)) throw Error("invalid manager state");
  return value as { ipcPath: string; ipcToken: string };
}
function signInLink(ipcPath: string, token: string) {
  return new Promise<string>((resolve, reject) => {
    const req = httpRequest({ socketPath: ipcPath, path: "/open", headers: { authorization: `Bearer ${token}` }, timeout: 5000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        try {
          if (res.statusCode !== 200) throw Error("no link");
          const url = new URL(JSON.parse(Buffer.concat(chunks).toString()).url);
          if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.hash.startsWith("#bootstrap=")) throw Error("invalid link");
          resolve(url.href);
        } catch (error) { reject(error); }
      });
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(Error("timeout"))); req.end();
  });
}
/** GET /connections on the local viewer: a click on the Connections tab, or the address opened by hand, lands signed in.
 * Only a top-level navigation the browser marks as the user's own or from this viewer gets a link; a page on another site
 * cannot trigger one, and fetch() cannot read it. Any local caller the viewer already trusts could ask with forged headers,
 * the same trust the local viewer gives every loopback caller today. */
export async function openLocalConnections(req: Request) {
  const unavailable = (text: string, status = 503) => new Response(text, { status, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  if (!localConnectionsEnabled()) return unavailable("Connections runs with the local viewer: start it with `npm run viewer` or `npm run dev`.", 404);
  try { await privateAccess(req); } catch { return unavailable("Local viewer access only.", 403); }
  const site = req.headers.get("sec-fetch-site");
  if (req.method !== "GET" || !["same-origin", "none"].includes(site ?? "") || req.headers.get("sec-fetch-mode") !== "navigate" || req.headers.get("sec-fetch-dest") !== "document")
    return unavailable("Open Connections from the viewer's Connections tab.", 403);
  try {
    const { ipcPath, ipcToken } = await manager(process.env.GTM_CONNECTIONS_MANAGER!);
    const link = await signInLink(ipcPath, ipcToken);
    // From the tailnet the manager's loopback address is out of reach: the page opens on the viewer's own address and
    // its calls come back through the viewer, which forwards them over the owner-only socket.
    return new Response(null, { status: 303, headers: { ...headers, location: tailnetRequest(req) ? `/connections/manage${new URL(link).hash}` : link } });
  } catch {
    return unavailable("Connections is not running. Restart the viewer (`npm run viewer` or `npm run dev`) to start it.");
  }
}

const pageHeaders = { ...headers, "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
/** GET /connections/manage in tailnet mode: the Connections page on the viewer's address. It signs in with the one-use
 * link in its fragment, which only /connections hands out. */
export async function localConnectionsPage(req: Request) {
  if (!localConnectionsEnabled() || !tailnetMode()) return new Response("Not found.", { status: 404, headers });
  try { await privateAccess(req); } catch { return new Response("Local viewer access only.", { status: 403, headers }); }
  return new Response('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connections</title><link rel="stylesheet" href="/connections-assets/app.css"></head><body><div id="root" data-tailnet="true"></div><script type="module" src="/connections-assets/app.js"></script></body></html>', { headers: pageHeaders });
}
const API_PATH = /^(?:connections|session|logout|health|production|production\/push)$/;
/** /api/connection-management/<path> in tailnet mode: the page's calls, forwarded to the manager's own API over its
 * owner-only socket. The manager still wants its session bearer and, for a change, its CSRF token; the viewer adds
 * the owner's tailnet login and, for a change, this viewer's exact origin from its own page. */
export async function forwardLocalConnections(req: Request, path: string) {
  const refuse = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (!localConnectionsEnabled() || !tailnetMode() || !API_PATH.test(path)) return refuse("not_found", 404);
  try { await privateAccess(req); } catch { return refuse("reopen_connections", 403); }
  const post = req.method === "POST";
  if ((!post && req.method !== "GET") || req.headers.get("sec-fetch-site") !== "same-origin" || (post && req.headers.get("origin") !== viewerOrigin(req)))
    return refuse("origin_denied", 403);
  const body = post ? Buffer.from(await req.arrayBuffer()) : undefined;
  if (body && body.length > 65536) return refuse("too_large", 413);
  let target: { ipcPath: string; ipcToken: string };
  try { target = await manager(process.env.GTM_CONNECTIONS_MANAGER!); } catch { return refuse("reopen_connections", 503); }
  const session = req.headers.get("authorization")?.replace(/^Bearer /, ""), csrf = req.headers.get("x-gtm-csrf");
  return new Promise<Response>((resolve) => {
    const forward = httpRequest({ socketPath: target.ipcPath, method: req.method, path: `/proxy/api/${path}`, timeout: 30000, headers: {
      authorization: `Bearer ${target.ipcToken}`, ...(session ? { "x-gtm-session": session } : {}), ...(csrf ? { "x-gtm-csrf": csrf } : {}),
      ...(body ? { "content-type": "application/json", "content-length": body.length } : {}) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502, headers: { ...headers, "content-type": "application/json" } })));
      res.on("error", () => resolve(refuse("connections_unavailable", 503)));
    });
    forward.on("error", () => resolve(refuse("connections_unavailable", 503)));
    forward.on("timeout", () => forward.destroy(Error("timeout")));
    forward.end(body);
  });
}
