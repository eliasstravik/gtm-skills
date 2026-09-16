import { randomBytes, createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, jwtVerify, createRemoteJWKSet } from "jose";
import { requireThat } from "./errors.mjs";
import { boundedResponse } from "./vercel.mjs";
const random = () => randomBytes(32).toString("base64url");
const cookieValue = (request, name) => request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
const cookie = (name, value, age) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;
export function oidcAuth({ origin, clientId, clientSecret, sessionSecret, journal, authority, fetcher = fetch,
  keys = createRemoteJWKSet(new URL("https://vercel.com/.well-known/jwks")) }) {
  requireThat(typeof sessionSecret === "string" && sessionSecret.length >= 43, "session_not_configured", 503);
  const key = createHash("sha256").update(sessionSecret).digest();
  const seal = (payload, seconds) => new EncryptJWT(payload).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setIssuer(origin).setAudience(origin).setExpirationTime(`${seconds}s`).encrypt(key);
  const unseal = async (value, kind) => {
    requireThat(value, "sign_in_required", 401);
    let result;
    try { result = (await jwtDecrypt(value, key, { issuer: origin, audience: origin })).payload; } catch { requireThat(false, "sign_in_required", 401); }
    requireThat(result.kind === kind, "sign_in_required", 401); return result;
  };
  return {
    async login() {
      const state = random(), nonce = random(), verifier = random();
      const url = new URL("https://vercel.com/oauth/authorize");
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${origin}/auth/callback`, response_type: "code", scope: "openid", state, nonce,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
      return new Response(null, { status: 302, headers: { location: url.href, "set-cookie": cookie("__Host-gtm_login", await seal({ kind: "login", state, nonce, verifier }, 300), 300) } });
    },
    async callback(request) {
      const transaction = await unseal(cookieValue(request, "__Host-gtm_login"), "login");
      const params = new URL(request.url).searchParams;
      requireThat(params.getAll("state").length === 1 && params.get("state") === transaction.state && params.getAll("code").length === 1 && params.get("code"), "login_transaction_denied", 403);
      await journal.consume(transaction.state, Number(transaction.exp) * 1000);
      const response = await fetcher("https://api.vercel.com/login/oauth/token", { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret,
          code: params.get("code"), redirect_uri: `${origin}/auth/callback`, code_verifier: transaction.verifier }) });
      requireThat(response.ok, "login_exchange_failed", 403);
      const tokenResponse = await boundedResponse(response, 32768);
      const { payload } = await jwtVerify(tokenResponse.id_token, keys, { issuer: "https://vercel.com", audience: clientId,
        requiredClaims: ["exp", "iat", "sub", "nonce"], maxTokenAge: "5m" });
      requireThat(payload.nonce === transaction.nonce && typeof payload.sub === "string" && payload.sub.length > 0, "identity_denied", 403);
      await authority(payload.sub);
      const session = await seal({ kind: "session", sub: payload.sub, csrf: random(), sid: random() }, 1800);
      const headers = new Headers({ location: "/" });
      headers.append("set-cookie", cookie("__Host-gtm_session", session, 1800));
      headers.append("set-cookie", cookie("__Host-gtm_login", "", 0));
      return new Response(null, { status: 302, headers });
    },
    async authorize(request) {
      const session = await unseal(cookieValue(request, "__Host-gtm_session"), "session");
      requireThat(!await journal.get(`revoked:${session.sid}`), "sign_in_required", 401);
      if (request.method !== "GET") requireThat(request.headers.get("origin") === origin && request.headers.get("sec-fetch-site") === "same-origin" && request.headers.get("x-gtm-csrf") === session.csrf, "csrf_denied", 403);
      return { ...await authority(session.sub), csrf: session.csrf, sid: session.sid };
    },
    async logout(request) {
      const session = await unseal(cookieValue(request, "__Host-gtm_session"), "session");
      await journal.set(`revoked:${session.sid}`, session.exp);
      return cookie("__Host-gtm_session", "", 0);
    },
  };
}
