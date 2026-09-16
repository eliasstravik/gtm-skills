import { fileURLToPath } from "node:url";
import { openJournal } from "./journal.mjs";
import { createManager } from "./manager.mjs";
import { fixedOrigin } from "./validation.mjs";
import { createHandler } from "./http.mjs";
import { oidcAuth } from "./oidc.mjs";
import { vercelTransport, hostedAuthority, vercelStorage, activeReader } from "./vercel.mjs";
let handler;
export async function hostedHandler(environment = process.env) {
  if (handler) return handler;
  const e = { ...environment, CONNECTIONS_DATABASE_URL: environment.CONNECTIONS_DATABASE_URL ?? environment.TURSO_DATABASE_URL,
    CONNECTIONS_DATABASE_TOKEN: environment.CONNECTIONS_DATABASE_TOKEN ?? environment.TURSO_AUTH_TOKEN };
  const origin = fixedOrigin(e.CONNECTIONS_ORIGIN);
  const publicDirectory = fileURLToPath(new URL("../dist/public", import.meta.url));
  const required = ["CONNECTIONS_TEAM_ID", "CONNECTIONS_PROJECT_ID", "CONNECTIONS_INTEGRATION_ID", "CONNECTIONS_INSTALLATION_ID", "CONNECTIONS_INTEGRATION_TOKEN", "CONNECTIONS_SESSION_SECRET", "CONNECTIONS_CLIENT_ID", "CONNECTIONS_CLIENT_SECRET", "CONNECTIONS_DATABASE_URL", "CONNECTIONS_DATABASE_TOKEN", "CONNECTIONS_RUNTIME_ORIGIN", "GTM_CONNECTIONS_READ_SECRET", "CONNECTIONS_RUNTIME_BYPASS", "CONNECTIONS_TEAM_SLUG", "CONNECTIONS_PROJECT_NAME"];
  if (required.some((name) => !e[name])) return createHandler({ mode: "production", origin, publicDirectory, ready: false });
  const fixed = { teamId: e.CONNECTIONS_TEAM_ID, projectId: e.CONNECTIONS_PROJECT_ID, integrationId: e.CONNECTIONS_INTEGRATION_ID, installationId: e.CONNECTIONS_INSTALLATION_ID };
  const api = vercelTransport({ token: e.CONNECTIONS_INTEGRATION_TOKEN, teamId: fixed.teamId });
  const journal = await openJournal({ url: e.CONNECTIONS_DATABASE_URL, authToken: e.CONNECTIONS_DATABASE_TOKEN });
  const runtimeOrigin = fixedOrigin(e.CONNECTIONS_RUNTIME_ORIGIN);
  const auth = oidcAuth({ origin, clientId: e.CONNECTIONS_CLIENT_ID, clientSecret: e.CONNECTIONS_CLIENT_SECRET, sessionSecret: e.CONNECTIONS_SESSION_SECRET, journal, authority: hostedAuthority(api, fixed) });
  const settings = `https://vercel.com/${encodeURIComponent(e.CONNECTIONS_TEAM_SLUG)}/${encodeURIComponent(e.CONNECTIONS_PROJECT_NAME)}`;
  const manager = createManager({ journal, storage: vercelStorage(api, fixed),
    active: activeReader({ origin: runtimeOrigin, projectId: fixed.projectId, readSecret: e.GTM_CONNECTIONS_READ_SECRET, bypass: e.CONNECTIONS_RUNTIME_BYPASS, api }),
    context: { mode: "production", workspace: fixed.projectId, workflowsUrl: `${runtimeOrigin}/viewer`, vercelUrl: `${settings}/settings/environment-variables`, deploymentUrl: `${settings}/deployments` } });
  handler = createHandler({ mode: "production", origin, manager, auth, publicDirectory, installationId: fixed.installationId, projectId: fixed.projectId });
  return handler;
}
