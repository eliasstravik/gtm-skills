import { lstat, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { request as httpRequest } from "node:http";
import { privateAccess } from "./viewer-access";

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
    return new Response(null, { status: 303, headers: { ...headers, location: await signInLink(ipcPath, ipcToken) } });
  } catch {
    return unavailable("Connections is not running. Restart the viewer (`npm run viewer` or `npm run dev`) to start it.");
  }
}
