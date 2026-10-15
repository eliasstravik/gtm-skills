import { defineHandler } from "nitro";
import { getVercelOidcToken } from "@vercel/oidc";
// Deliberately no imports from lib/, the workflow runtime or database.

/**
 * Public webhook relay. Senders cannot pass the private runtime's Vercel Authentication, so they post here and this
 * project forwards the raw body and the sender's signature headers with its own Vercel OIDC identity, which the
 * private project trusts. It holds no signing secret: the private intake route verifies the signature and dedupes.
 * Unsigned requests stop here.
 */
const LIMIT = 1024 * 1024;
const SIGNATURE = /^(?:x-[a-z0-9-]*signature[a-z0-9-]*|[a-z0-9-]*-signature|webhook-signature|svix-signature)$/;
const FORWARD = /^(?:webhook-(?:id|timestamp)|svix-(?:id|timestamp)|x-[a-z0-9-]*-(?:event|delivery|timestamp))$/;
export default defineHandler(async (event) => {
  const headers = {
    "cache-control": "no-store",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  };
  const reply = (status: number, error: string) =>
    Response.json({ error }, { status, headers });
  const slug = event.context.params?.slug ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug))
    return reply(404, "No such intake");
  const origin = process.env.GTM_VIEWER_PRIVATE_ORIGIN;
  if (!origin || process.env.VERCEL_ENV !== "production")
    return reply(503, "Intake is not configured");
  let upstream: URL;
  try {
    upstream = new URL(`/api/intake/${slug}`, origin);
    if (upstream.protocol !== "https:" || upstream.origin !== origin) throw Error();
  } catch {
    return reply(503, "Intake is not configured");
  }
  const forward: Record<string, string> = {};
  let signed = false;
  for (const [name, value] of event.req.headers) {
    const key = name.toLowerCase();
    // Vercel stamps its own x-vercel-* headers (x-vercel-proxy-signature among them) on every request; never the sender's.
    if (key.startsWith("x-vercel-")) continue;
    if (SIGNATURE.test(key)) signed = true;
    if ((SIGNATURE.test(key) || FORWARD.test(key)) && value.length <= 1024) forward[key] = value;
  }
  if (!signed) return reply(401, "Signed webhooks only");
  const reader = event.req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > LIMIT) return reply(413, "Body too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
  try {
    const oidc = await getVercelOidcToken();
    if (!oidc) return reply(503, "Intake is not configured");
    const response = await fetch(upstream, {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      body: Buffer.concat(chunks),
      headers: {
        ...forward,
        "content-type": event.req.headers.get("content-type") ?? "application/json",
        "x-vercel-trusted-oidc-idp-token": oidc,
      },
    });
    // The private route answers small JSON; anything else (a Vercel login page) is a configuration fault.
    const text = (await response.text()).slice(0, 4096);
    if (!response.headers.get("content-type")?.includes("application/json"))
      return response.status === 404
        ? reply(404, "No such intake")
        : reply(502, "The private runtime did not accept the relay");
    return new Response(text, { status: response.status, headers });
  } catch {
    return reply(502, "The private runtime is unavailable");
  }
});
