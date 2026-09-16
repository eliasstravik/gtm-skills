import { randomBytes, timingSafeEqual } from "node:crypto";
import { requireThat } from "../src/errors.mjs";
const token = () => randomBytes(32).toString("base64url");
const equal = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function localAuth(origin, now = Date.now) {
  let bootstrap = token(), bootstrapUntil = now() + 60000;
  const sessions = new Map();
  return {
    opener() { requireThat(bootstrap && now() < bootstrapUntil, "reopen_connections", 401); return `${origin}/#bootstrap=${bootstrap}`; },
    renew() { bootstrap = token(); bootstrapUntil = now() + 60000; },
    boundary(request, peer) {
      const url = new URL(request.url);
      requireThat(["127.0.0.1", "::ffff:127.0.0.1"].includes(peer) && request.headers.get("host") === new URL(origin).host && url.origin === origin, "loopback_only", 403);
      requireThat(![...request.headers.keys()].some((key) => key === "forwarded" || key.startsWith("x-forwarded-") || key.startsWith("x-vercel-")), "proxy_denied", 403);
      const sentOrigin = request.headers.get("origin");
      requireThat(!sentOrigin || sentOrigin === origin, "origin_denied", 403);
      if (request.method !== "GET") requireThat(sentOrigin === origin && request.headers.get("sec-fetch-site") === "same-origin", "origin_denied", 403);
    },
    exchange(value) {
      requireThat(bootstrap && now() < bootstrapUntil && equal(value, bootstrap), "reopen_connections", 401);
      bootstrap = null;
      const bearer = token(), csrf = token();
      sessions.set(bearer, { csrf, created: now(), seen: now() });
      return { bearer, csrf };
    },
    authorize(request) {
      const bearer = request.headers.get("authorization")?.replace(/^Bearer /, ""), session = sessions.get(bearer);
      requireThat(session && now() - session.created < 3600000 && now() - session.seen < 900000, "reopen_connections", 401);
      if (request.method !== "GET") requireThat(equal(request.headers.get("x-gtm-csrf"), session.csrf), "csrf_denied", 403);
      session.seen = now(); return { actor: "local-owner", write: true, csrf: session.csrf };
    },
    logout(request) { sessions.delete(request.headers.get("authorization")?.replace(/^Bearer /, "")); },
  };
}
