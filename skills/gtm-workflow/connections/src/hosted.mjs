import { fileURLToPath } from "node:url";
import { openJournal } from "./journal.mjs";
import { createManager } from "./manager.mjs";
import { fixedOrigin } from "./validation.mjs";
import { createHandler } from "./http.mjs";
import { oidcAuth } from "./oidc.mjs";
import { vercelTransport, hostedAuthority, vercelStorage, activeReader } from "./vercel.mjs";
import { verificationReceipt } from "./verification.mjs";
import { requireThat } from "./errors.mjs";
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
  const active = activeReader({ origin: runtimeOrigin, projectId: fixed.projectId, readSecret: e.GTM_CONNECTIONS_READ_SECRET, bypass: e.CONNECTIONS_RUNTIME_BYPASS, api });
  const manager = createManager({ journal, storage: vercelStorage(api, fixed), active,
    context: { mode: "production", workspace: fixed.projectId, workspaceName: `${e.CONNECTIONS_TEAM_SLUG} / ${e.CONNECTIONS_PROJECT_NAME}`,
      workflowsUrl: `${runtimeOrigin}/viewer`, vercelUrl: `${settings}/settings/environment-variables`, deploymentUrl: `${settings}/deployments` } });
  const verification = async (principal) => {
    const runtime = await active();
    requireThat(e.VERCEL_DEPLOYMENT_ID && e.VERCEL_PROJECT_ID && e.CONNECTIONS_COMPONENT_DIGEST && runtime.commit, "verification_unavailable", 503);
    return verificationReceipt({ origin, teamId: fixed.teamId, projectId: fixed.projectId, adminProjectId: e.VERCEL_PROJECT_ID,
      installationId: fixed.installationId, actor: principal.actor, deploymentId: e.VERCEL_DEPLOYMENT_ID,
      runtimeDeploymentId: runtime.deploymentId, runtimeCommit: runtime.commit, componentDigest: e.CONNECTIONS_COMPONENT_DIGEST }, e.CONNECTIONS_SESSION_SECRET);
  };
  handler = createHandler({ mode: "production", origin, manager, auth, publicDirectory, verification, installationId: fixed.installationId, projectId: fixed.projectId });
  return handler;
}
