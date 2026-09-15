#!/usr/bin/env node
// Run with `vercel env run -e production --project <agent> -- node <this-file> <agent-url>`.
// Only public grant names leave this process, never its environment or credentials.
const url = new URL(process.argv[2]);
if (url.protocol !== "https:") throw new Error("Agent health requires HTTPS.");
const credential = process.env.VERCEL_OIDC_TOKEN || process.env.GTM_NOTIFY_SECRET;
if (!credential) {
  console.log(JSON.stringify({ ok: false, error: "Vercel project OIDC credential unavailable to the check process" }));
  process.exit(1);
}
try {
  const result = await fetch(new URL("/eve/v1/gtm/slack-health", url), {
    headers: { authorization: `Bearer ${credential}` }, redirect: "error", signal: AbortSignal.timeout(20000),
  });
  const body = await result.json();
  console.log(JSON.stringify({ ok: result.ok && body.ok === true, scopes: body.scopes ?? [], error: body.error ?? (result.ok ? undefined : `HTTP ${result.status}`) }));
} catch { console.log(JSON.stringify({ ok: false, error: "Live Slack permission check unavailable; deploy the current agent and retry." })); }
