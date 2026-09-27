#!/usr/bin/env node
// Run with `vercel env run -e production --project <agent> -- node <this-file>`. Calls one agent-only route of the
// workflow project the way the agent does, with its bypass; prints only the HTTP status, never the environment.
const base = process.env.GTM_WORKFLOW_URL, bypass = process.env.GTM_WORKFLOW_BYPASS_SECRET;
if (!base || !bypass) { console.log(JSON.stringify({ status: 0, error: "GTM_WORKFLOW_URL or GTM_WORKFLOW_BYPASS_SECRET missing" })); process.exit(0); }
try {
  const result = await fetch(new URL("/api/connections", base), { headers: { "x-vercel-protection-bypass": bypass }, redirect: "manual", signal: AbortSignal.timeout(20000) });
  console.log(JSON.stringify({ status: result.status }));
} catch { console.log(JSON.stringify({ status: 0, error: "workflow project unreachable" })); }
