import { timingSafeEqual } from "node:crypto";
import { privateAccess } from "./viewer-access";

const same = (given: string, expected: string | undefined) =>
  Boolean(expected) && Buffer.byteLength(given) === Buffer.byteLength(expected!) && timingSafeEqual(Buffer.from(given), Buffer.from(expected!));
/** The GTM agent's pass: Vercel's own Protection Bypass for Automation, which the agent's host adds outside its sandbox. */
export const automationBypass = (req: Request) =>
  same(req.headers.get("x-vercel-protection-bypass") ?? "", process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
/** Vercel Cron's call: `Authorization: Bearer <CRON_SECRET>`. */
export const cronCall = (req: Request) =>
  same(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "", process.env.CRON_SECRET);

/**
 * Who may call the API routes (run, runs, link, query; with `agent`, share links and key names).
 * Hosted: Vercel Authentication on all deployments already stopped everyone outside the team (setup and doctor
 * enforce it, and GTM_VIEWER_PROTECTED says it was verified), so a request that reached the function is let in:
 * a teammate with `vercel curl`, the agent through its bypass, Vercel Cron with CRON_SECRET. Never the share relay's
 * identity, which only intake and the shared viewer take, and the agent-only routes want the automation bypass.
 * Local: only this computer (or the owner's tailnet login in tailnet mode), and a change only from this viewer's own
 * pages or a plain client such as curl, never from a web page on another site in the owner's browser.
 */
export async function apiAccess(req: Request, { cron = false, agent = false } = {}): Promise<boolean> {
  if (process.env.VERCEL) {
    if (process.env.GTM_VIEWER_PROTECTED !== "1" || req.headers.has("x-vercel-trusted-oidc-idp-token")) return false;
    if (cron) return cronCall(req);
    return agent ? automationBypass(req) : true;
  }
  if (agent) return false;
  try { await privateAccess(req); } catch { return false; }
  if (req.method === "GET" || req.method === "HEAD") return true;
  // privateAccess already refused an Origin other than this viewer's; a request with neither header is a plain client.
  const site = req.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}
