import { getVercelOidcTokenSync } from "@vercel/oidc";

/** Detect the same request-scoped identity used by AI Gateway, without exposing its token. */
export function gatewayPlatformIdentity(): boolean {
  if (!process.env.VERCEL || process.env.GTM_VIEWER_MODE === "share") return false;
  try { return Boolean(getVercelOidcTokenSync()); }
  catch { return false; }
}
