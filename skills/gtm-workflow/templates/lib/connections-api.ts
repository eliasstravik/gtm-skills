import { timingSafeEqual } from "node:crypto";
import { CONNECTIONS_VERSION, configuredNames, connectionInventory, runtimeLabels, type ConnectionWorkflow } from "./connections-contract";
import { connectionConfiguration } from "./connections-access";
import { connectionMetadata, connectionsVercel } from "./connections-management";
import { bearerOk } from "./sign";
import { gatewayPlatformIdentity } from "./connections-platform";
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" };
export async function connectionsApi(req: Request, workflows: ConnectionWorkflow[]) {
  const dedicated = process.env.GTM_CONNECTIONS_READ_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const readOk = dedicated && Buffer.byteLength(given) === Buffer.byteLength(dedicated) && timingSafeEqual(Buffer.from(given), Buffer.from(dedicated));
  if (req.method !== "GET" || process.env.GTM_VIEWER_MODE === "share" || (!bearerOk(req) && !readOk))
    return Response.json({ error: "Connection inventory requires read authorization." }, { status: 401, headers });
  const hosted = Boolean(process.env.VERCEL);
  const workspace = hosted ? process.env.VERCEL_PROJECT_ID : process.env.GTM_CONNECTIONS_WORKSPACE;
  const environment = hosted ? process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV : "local";
  if (!workspace || !environment) return Response.json({ error: "Connection identity is unavailable." }, { status: 503, headers });
  let names = configuredNames(process.env), labels = runtimeLabels(process.env);
  if (hosted && process.env.GTM_CONNECTIONS_ENABLED === "1") {
    try {
      const config = connectionConfiguration(), rows = await connectionMetadata(connectionsVercel(config), config.projectId);
      labels = Object.fromEntries(rows.map((row) => [row.variable, row.comment]));
      names = [...new Set([...names, ...rows.map((row) => row.variable)])].filter((name) => Boolean(process.env[name]?.trim()));
    } catch { return Response.json({ error: "Connection names are unavailable." }, { status: 503, headers }); }
  }
  return Response.json({ version: CONNECTIONS_VERSION, workspace, environment,
    deploymentId: hosted ? process.env.VERCEL_DEPLOYMENT_ID ?? null : null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    generation: hosted ? null : process.env.GTM_CONNECTIONS_GENERATION ?? null,
    processGeneration: hosted ? null : process.env.GTM_CONNECTIONS_PROCESS_GENERATION ?? null,
    connections: connectionInventory(names, workflows, gatewayPlatformIdentity(), labels),
  }, { headers });
}
