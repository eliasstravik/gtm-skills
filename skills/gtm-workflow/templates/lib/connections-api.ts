import { CONNECTIONS_VERSION, configuredNames, connectionInventory, runtimeLabels, type ConnectionWorkflow } from "./connections-contract";
import { connectionConfiguration } from "./connections-access";
import { connectionMetadata, connectionsVercel } from "./connections-management";
import { apiAccess } from "./route-access";
import { localKeyNames } from "./connections-local";
import { gatewayPlatformIdentity } from "./connections-platform";
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
export async function connectionsApi(req: Request, workflows: ConnectionWorkflow[]) {
  if (req.method !== "GET" || process.env.GTM_VIEWER_MODE === "share" || !(await apiAccess(req, { agent: Boolean(process.env.VERCEL) })))
    return Response.json({ error: "Connection inventory requires read authorization." }, { status: 401, headers });
  const hosted = Boolean(process.env.VERCEL);
  const workspace = hosted ? process.env.VERCEL_PROJECT_ID : "local";
  const environment = hosted ? process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV : "local";
  if (!workspace || !environment) return Response.json({ error: "Connection identity is unavailable." }, { status: 503, headers });
  // Locally: the keys this server loaded from `.env` and `.env.local`. Hosted: the keys saved through the Keys page.
  let names = hosted ? configuredNames(process.env) : localKeyNames(), labels = hosted ? runtimeLabels(process.env) : {};
  if (hosted && process.env.GTM_CONNECTIONS_ENABLED === "1") {
    try {
      // The live marker, not this deployment's copy: a key saved since the last build is listed once it is deployed.
      const config = connectionConfiguration(), rows = (await connectionMetadata(connectionsVercel(config), config.projectId)).filter((row) => row.managed);
      labels = Object.fromEntries(rows.map((row) => [row.variable, row.comment]));
      names = rows.map((row) => row.variable).filter((name) => Boolean(process.env[name]?.trim())).sort();
    } catch { return Response.json({ error: "Connection names are unavailable." }, { status: 503, headers }); }
  }
  return Response.json({ version: CONNECTIONS_VERSION, workspace, environment,
    deploymentId: hosted ? process.env.VERCEL_DEPLOYMENT_ID ?? null : null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    connections: connectionInventory(names, workflows, gatewayPlatformIdentity(), labels),
  }, { headers });
}
