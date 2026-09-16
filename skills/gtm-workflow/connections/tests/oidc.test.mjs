import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT, jwtDecrypt } from "jose";
import { oidcAuth } from "../src/oidc.mjs";
import { openJournal } from "../src/journal.mjs";
test("OIDC verifies signed subject and nonce, rejects replay and rechecks revocation", async () => {
  const journal = await openJournal({ url: ":memory:" }), { publicKey, privateKey } = await generateKeyPair("RS256");
  const origin = "https://connections.example", sessionSecret = "synthetic-session-signing-material-long-enough-12345";
  let granted = true, transaction, token;
  const auth = oidcAuth({ origin, clientId: "client", clientSecret: "synthetic-client-secret", sessionSecret, journal, keys: publicKey,
    authority: async (subject) => { assert.equal(subject, "user_a"); if (!granted) throw Error("removed member"); return { actor: subject, write: true }; },
    fetcher: async (_url, options) => {
      assert.equal(options.body.get("code_verifier"), transaction.verifier);
      token = await new SignJWT({ nonce: transaction.nonce }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://vercel.com").setAudience("client").setSubject("user_a").setIssuedAt().setExpirationTime("5m").sign(privateKey);
      return Response.json({ id_token: token, access_token: "synthetic-access-token-never-return" });
    },
  });
  try {
    const login = await auth.login(), target = new URL(login.headers.get("location")), cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(target.searchParams.get("code_challenge_method"), "S256");
    transaction = (await jwtDecrypt(cookie.slice(cookie.indexOf("=") + 1), createHash("sha256").update(sessionSecret).digest())).payload;
    const callback = new Request(`${origin}/auth/callback?code=synthetic-code&state=${target.searchParams.get("state")}`, { headers: { cookie } });
    const response = await auth.callback(callback);
    assert.equal(response.status, 302); assert.equal(response.headers.get("location"), "/");
    const cookies = response.headers.getSetCookie(), session = cookies.find((value) => value.startsWith("__Host-gtm_session=")).split(";")[0];
    assert.equal(cookies.join().includes(token), false); assert.equal(cookies.join().includes("synthetic-access-token"), false);
    await assert.rejects(auth.callback(callback), /transaction_used/);
    const request = new Request(`${origin}/api/session`, { headers: { cookie: session } });
    const actor = await auth.authorize(request); assert.equal(actor.actor, "user_a");
    await assert.rejects(auth.authorize(new Request(`${origin}/api/connections`, { method: "POST", headers: { cookie: session } })), /csrf_denied/);
    granted = false; await assert.rejects(auth.authorize(request), /removed member/);
    granted = true; await auth.logout(request); await assert.rejects(auth.authorize(request), /sign_in_required/);
  } finally { journal.close(); }
});
