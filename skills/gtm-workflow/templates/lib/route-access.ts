import { bearerOk } from "./sign";
import { privateAccess } from "./viewer-access";

/**
 * Who may call the API routes (run, runs, link, query, key names). Hosted: the bearer (the cron GET also CRON_SECRET).
 * Local: only this computer (or the owner's tailnet login in tailnet mode), and a change only from this viewer's own
 * pages or a plain client such as curl, never from a web page on another site in the owner's browser.
 */
export async function apiAccess(req: Request, { cron = false } = {}): Promise<boolean> {
  if (process.env.VERCEL) return bearerOk(req, cron);
  try { await privateAccess(req); } catch { return false; }
  if (req.method === "GET" || req.method === "HEAD") return true;
  // privateAccess already refused an Origin other than this viewer's; a request with neither header is a plain client.
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}
