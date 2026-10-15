import { getVercelOidcTokenSync } from "@vercel/oidc";

/** Detect the same request-scoped identity used by AI Gateway, without exposing its token. */
export function gatewayPlatformIdentity(): boolean {
  if (!process.env.VERCEL || process.env.GTM_VIEWER_MODE === "share") return false;
  try { return Boolean(getVercelOidcTokenSync()); }
  catch { return false; }
}
/** Whether Vercel's identity stands in for the AI Gateway key: hosted, the request's; locally, the token `vercel env pull` leaves in `.env.local`, which the AI SDK reads. */
export const platformIdentity = () => process.env.VERCEL ? gatewayPlatformIdentity() : Boolean(process.env.VERCEL_OIDC_TOKEN?.trim());
