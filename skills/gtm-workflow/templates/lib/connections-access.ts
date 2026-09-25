import { createHmac, timingSafeEqual } from "node:crypto";

export const CONNECTION_ACCESS_PROBE = "gtm-private-connections-v1";
export class ConnectionsError extends Error {
  constructor(public code: string, public status = 403) { super(code); }
}
export function insist(value: unknown, code: string, status = 403): asserts value {
  if (!value) throw new ConnectionsError(code, status);
}
export const connectionHeaders = {
  "cache-control": "private, no-store", "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff", "x-frame-options": "DENY",
};
export function connectionConfiguration(env = process.env) {
  insist(env.VERCEL && env.VERCEL_ENV === "production" && env.GTM_VIEWER_MODE !== "share" &&
    env.GTM_VIEWER_PROTECTED === "1" && env.GTM_CONNECTIONS_ENABLED === "1", "connections_disabled", 503);
  const origin = env.GTM_CONNECTIONS_ORIGIN;
  insist(origin && new URL(origin).origin === origin && origin.startsWith("https://"), "connections_disabled", 503);
  insist(env.VERCEL_PROJECT_ID && env.GTM_CONNECTIONS_TEAM_ID && env.GTM_CONNECTIONS_VERCEL_TOKEN, "connections_disabled", 503);
  return { origin, projectId: env.VERCEL_PROJECT_ID, teamId: env.GTM_CONNECTIONS_TEAM_ID,
    token: env.GTM_CONNECTIONS_VERCEL_TOKEN };
}
/** Native Vercel sessions are validated by Vercel itself, never by trusting decoded JWT claims.
 * The cookie shape is a fail-closed compatibility check, not a signature verifier.
 * No incoming bypass, bearer or workload identity is forwarded to the independent probe.
 * Getting past Vercel Authentication is not enough: an automation bypass or a trusted OIDC caller has no owner session.
 */
export async function ownerSession(req: Request, config: { origin: string; teamId: string }, fetcher = fetch) {
  const url = new URL(req.url);
  insist(url.origin === config.origin, "private_browser_required");
  for (const name of ["authorization", "x-vercel-protection-bypass", "x-vercel-set-bypass-cookie", "x-vercel-trusted-oidc-idp-token"])
    insist(!req.headers.has(name) && ![...url.searchParams.keys()].some((key) => key.toLowerCase() === name), "private_browser_required");
  const cookies = (req.headers.get("cookie") ?? "").split(";").map((c) => c.trim()).filter((c) => c.startsWith("_vercel_jwt="));
  insist(cookies.length === 1, "private_browser_required");
  const cookie = cookies[0], token = cookie.slice("_vercel_jwt=".length);
  insist(token.length < 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), "private_browser_required");
  let claims: Record<string, unknown>;
  try { claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); }
  catch { throw new ConnectionsError("private_browser_required"); }
  insist(claims && !Object.hasOwn(claims, "bypass") && typeof claims.userId === "string" && claims.userId.length > 0 &&
    claims.ownerId === config.teamId && claims.aud === url.hostname && claims.sub === "sso-protection", "private_browser_required");
  // Also probe anonymously. Disabling Deployment Protection must disable this feature,
  // even if a client sends a forged cookie and an old configuration opt-in remains.
  const probe = `${config.origin}/api/connection-access`;
  let anonymous: Response, authenticated: Response;
  try {
    [anonymous, authenticated] = await Promise.all([
      fetcher(probe, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000) }),
      fetcher(probe, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10000), headers: { cookie } }),
    ]);
  } catch { throw new ConnectionsError("access_verification_unavailable", 503); }
  try {
    insist([301, 302, 303, 307, 308, 401, 403].includes(anonymous.status), "deployment_protection_required");
    insist(authenticated.status === 200 && await authenticated.text() === CONNECTION_ACCESS_PROBE, "private_browser_required");
  } finally { await anonymous.body?.cancel(); if (!authenticated.bodyUsed) await authenticated.body?.cancel(); }
  return { token };
}
export async function privateConnectionBrowser(req: Request, config: ReturnType<typeof connectionConfiguration>, fetcher = fetch) {
  const { token } = await ownerSession(req, config, fetcher);
  const csrf = createHmac("sha256", config.token).update(`connections-v1:${config.origin}:${token}`).digest("base64url");
  if (req.method !== "GET") {
    const supplied = req.headers.get("x-gtm-csrf") ?? "";
    insist(req.headers.get("origin") === config.origin && req.headers.get("sec-fetch-site") === "same-origin" &&
      req.headers.get("content-type")?.split(";")[0] === "application/json" &&
      supplied.length === csrf.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(csrf)), "csrf_denied");
  }
  return { csrf };
}

export function connectionProbe() {
  return new Response(CONNECTION_ACCESS_PROBE, { headers: { ...connectionHeaders, "content-type": "text/plain" } });
}
