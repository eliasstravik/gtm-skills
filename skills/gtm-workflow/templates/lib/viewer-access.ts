import { randomBytes, timingSafeEqual } from "node:crypto";
import { ViewerError } from "./viewer-grants";
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
/** The opt-in is set only after Vercel Authentication is enabled on All Deployments. */
export function privateAccess(req: Request) {
  const url = new URL(req.url);
  if (process.env.VERCEL) {
    if (process.env.GTM_VIEWER_PROTECTED !== "1")
      throw new ViewerError(
        503,
        "disabled",
        "The private viewer is not enabled.",
      );
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
export function requireMutation(req: Request) {
  privateAccess(req);
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
