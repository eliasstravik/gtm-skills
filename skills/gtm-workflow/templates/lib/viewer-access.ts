import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ViewerError } from "./viewer-grants";
import { ownerSession } from "./connections-access";
export const viewerHeaders = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
export function deploymentScope() {
  if (!process.env.VERCEL)
    return {
      workspace: process.env.GTM_VIEWER_WORKSPACE ?? "local",
      environment: "local",
    };
  const workspace = process.env.VERCEL_PROJECT_ID;
  const environment = process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV;
  if (!workspace || !environment)
    throw new ViewerError(
      503,
      "configuration",
      "Viewer identity is not configured.",
    );
  return { workspace, environment };
}
// Owner sessions Vercel confirmed recently, by cookie hash, so polling does not probe on every request.
const confirmed = new Map<string, number>();
const CONFIRMED_MS = 60_000;
/** A signed-in owner, as Vercel confirms it. Passing Vercel Authentication alone (an automation bypass, a trusted
 * OIDC caller such as the share project) is not an owner; those reach only bearer, share-token or signed routes. */
export async function hostedOwner(req: Request, fetcher = fetch) {
  const origin = process.env.GTM_CONNECTIONS_ORIGIN, teamId = process.env.GTM_CONNECTIONS_TEAM_ID;
  if (!origin || !teamId)
    throw new ViewerError(503, "configuration", "Run hosted setup before opening the private viewer.");
  const key = createHash("sha256").update(req.headers.get("cookie") ?? "").digest("base64url");
  const bypass = ["authorization", "x-vercel-protection-bypass", "x-vercel-set-bypass-cookie", "x-vercel-trusted-oidc-idp-token"]
    .some((name) => req.headers.has(name) || new URL(req.url).searchParams.has(name));
  if (!bypass && (confirmed.get(key) ?? 0) > Date.now()) return;
  try {
    await ownerSession(req, { origin, teamId }, fetcher);
  } catch (error) {
    const unavailable = (error as { status?: number }).status === 503;
    throw new ViewerError(unavailable ? 503 : 403, unavailable ? "unavailable" : "owner_required",
      unavailable ? "Could not confirm your Vercel session. Try again." : "Open the private viewer signed in to Vercel.");
  }
  if (confirmed.size > 1000) confirmed.clear();
  confirmed.set(key, Date.now() + CONFIRMED_MS);
}
/** Tests replace `check` to stand in for Vercel; nothing in the runtime reassigns it. */
export const hostedOwnerCheck = { check: hostedOwner };
/** The opt-in is set only after Vercel Authentication is enabled on All Deployments. */
export async function privateAccess(req: Request, fetcher = fetch) {
  const url = new URL(req.url);
  if (process.env.VERCEL) {
    if (process.env.GTM_VIEWER_PROTECTED !== "1")
      throw new ViewerError(
        503,
        "disabled",
        "The private viewer is not enabled.",
      );
    await hostedOwnerCheck.check(req, fetcher);
  } else {
    const tailnet = tailnetMode();
    if (tailnet && fromTailnet(req, tailnet)) return tailnetOwner(req, tailnet);
    const host = req.headers.get("host");
    const allowed = ["127.0.0.1", "localhost", "[::1]"];
    if (!allowed.includes(url.hostname) || host !== url.host)
      throw new ViewerError(403, "host_denied", "Local viewer access only.");
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin)
      throw new ViewerError(
        403,
        "origin_denied",
        "Use the local viewer address.",
      );
  }
}
/** Opt-in tailnet mode, local only: Tailscale Serve proxies `GTM_VIEWER_TAILNET_ORIGIN` straight to this viewer, and only
 * requests Serve marks with the owner's login get in. Serve drops identity headers a client sends and adds its own, and
 * adds X-Forwarded-For, so a request from the tailnet always shows where it came from. Never Funnel: that is public. */
export function tailnetMode(env = process.env) {
  if (env.VERCEL) return null;
  const owner = env.GTM_VIEWER_TAILNET_OWNER?.trim().toLowerCase(), value = env.GTM_VIEWER_TAILNET_ORIGIN?.trim();
  if (!owner && !value) return null;
  try {
    const url = new URL(value!);
    if (owner && url.origin === value && url.protocol === "https:" && url.hostname.endsWith(".ts.net"))
      return { owner, origin: url.origin, host: url.host };
  } catch {}
  // Half a setting fails closed: the owner meant to open the viewer to the tailnet, and gets told why it is shut.
  throw new ViewerError(503, "tailnet_configuration", "Set both GTM_VIEWER_TAILNET_OWNER and GTM_VIEWER_TAILNET_ORIGIN (https://<host>.ts.net[:port]).");
}
type Tailnet = NonNullable<ReturnType<typeof tailnetMode>>;
function fromTailnet(req: Request, tailnet: Tailnet) {
  const h = req.headers;
  return ["tailscale-user-login", "tailscale-funnel-request", "x-forwarded-for", "x-forwarded-host", "forwarded"].some((name) => h.has(name)) ||
    h.get("host") === tailnet.host || h.get("origin") === tailnet.origin;
}
function tailnetOwner(req: Request, tailnet: Tailnet) {
  const h = req.headers;
  if (h.has("tailscale-funnel-request"))
    throw new ViewerError(403, "funnel_denied", "The viewer is never public; use Tailscale Serve, not Funnel.");
  // A Host-rewriting relay would hide X-Forwarded-For, so a tagged device without a login would pass as local: Serve
  // must point at the viewer itself.
  if (h.get("host") !== tailnet.host)
    throw new ViewerError(403, "host_denied", "Point Tailscale Serve straight at the viewer, without a relay.");
  if (h.get("tailscale-user-login")?.trim().toLowerCase() !== tailnet.owner)
    throw new ViewerError(403, "tailnet_owner_required", "Only the workspace owner's Tailscale login opens this viewer.");
  const origin = h.get("origin");
  if (origin && origin !== tailnet.origin)
    throw new ViewerError(403, "origin_denied", "Use the viewer's tailnet address.");
}
/** The tailnet setting when this request came through Tailscale Serve in tailnet mode, else null. */
export function tailnetRequest(req: Request) {
  const tailnet = tailnetMode();
  return tailnet && fromTailnet(req, tailnet) ? tailnet : null;
}
/** The origin a browser page of this viewer sends: the tailnet address for a request from the tailnet, else the request's own. */
export function viewerOrigin(req: Request) {
  return tailnetRequest(req)?.origin ?? new URL(req.url).origin;
}
export function csrfCookie() {
  const value = randomBytes(32).toString("base64url");
  return {
    value,
    cookie: `gtm_viewer_csrf=${value}; Path=/; SameSite=Strict; HttpOnly${process.env.VERCEL ? "; Secure" : ""}`,
  };
}
export async function requireMutation(req: Request) {
  await privateAccess(req);
  if (
    req.headers.get("origin") !== viewerOrigin(req) ||
    req.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new ViewerError(403, "csrf", "Open sharing from the private viewer.");
  const cookie =
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("gtm_viewer_csrf="))
      ?.slice(16) ?? "";
  const header = req.headers.get("x-gtm-csrf") ?? "";
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(cookie) ||
    header.length !== cookie.length ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(cookie))
  )
    throw new ViewerError(
      403,
      "csrf",
      "Refresh the viewer before changing sharing.",
    );
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new ViewerError(415, "content_type", "JSON is required.");
}
export async function boundedJson(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) return {};
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 8192)
        throw new ViewerError(413, "too_large", "Request too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString());
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error();
    return result;
  } catch {
    throw new ViewerError(400, "invalid_json", "Invalid JSON request.");
  }
}
