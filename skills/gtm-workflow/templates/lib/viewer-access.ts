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
export function csrfCookie() {
  const value = randomBytes(32).toString("base64url");
  return {
    value,
    cookie: `gtm_viewer_csrf=${value}; Path=/; SameSite=Strict; HttpOnly${process.env.VERCEL ? "; Secure" : ""}`,
  };
}
export async function requireMutation(req: Request) {
  await privateAccess(req);
  const url = new URL(req.url);
  if (
    req.headers.get("origin") !== url.origin ||
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
