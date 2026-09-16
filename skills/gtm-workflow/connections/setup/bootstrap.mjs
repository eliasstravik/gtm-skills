import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { INTEGRATION_SCOPES, validateInstallation, vercelTransport, currentMember, boundedResponse } from "../src/vercel.mjs";
import { requireThat, ConnectionError } from "../src/errors.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
const equal = (a, b) => typeof a === "string" && typeof b === "string" && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const bindingKeys = ["ownerId", "teamId", "projectId", "adminProjectId"];
function verifyTransaction(stage, fixed) {
  requireThat(stage && bindingKeys.every((key) => typeof fixed[key] === "string" && stage[key] === fixed[key]), "installation_binding_changed", 403);
  requireThat(!stage.integrationId || stage.integrationId === fixed.integrationId, "installation_binding_changed", 403);
}
export async function cleanupBootstrap({ api, fixed, journal, store, completed = false }) {
  await verifyOwner(api, fixed);
  const stage = await journal.get("bootstrap"); verifyTransaction(stage, fixed);
  requireThat(completed ? stage.phase === "deployed_verified" : stage.expires <= Date.now(), "bootstrap_cleanup_not_ready", 409);
  // If native deletion fails, leave the stage unfinished so cleanup can resume.
  for (const key of ["INTEGRATION_CLIENT_SECRET", "INTEGRATION_TOKEN", "IDENTITY_CLIENT_SECRET"]) store.remove(key);
  await journal.set("bootstrap", { ...stage, phase: completed ? "complete" : "expired", expires: 0 });
  return { status: completed ? "complete" : "bootstrap_expired", ...(stage.installationId && !completed ? { installationId: stage.installationId, revocationRequired: true } : {}) };
}
export async function verifyOwner(api, fixed) {
  const result = await api("GET", "/v2/user"), uid = result.user?.id;
  requireThat(typeof uid === "string" && (!fixed.ownerId || fixed.ownerId === uid), "cli_owner_changed", 403);
  const member = await currentMember(api, fixed.teamId, uid); requireThat(member.role === "OWNER", "cli_owner_required", 403);
  for (const [id, admin] of [[fixed.projectId, false], [fixed.adminProjectId, true]]) {
    const project = await api("GET", `/v9/projects/${encodeURIComponent(id)}`);
    requireThat(project.id === id && project.accountId === fixed.teamId && (!admin || !project.link), "setup_project_binding_denied", 403);
  }
  return uid;
}
/** No hosted route imports this module. Only the owner's local CLI writes the admin secret. */
export async function installGrant({ api, fixed, journal, store, code, redirect, fetcher = fetch }) {
  await verifyOwner(api, fixed);
  const stage = await journal.get("bootstrap");
  verifyTransaction(stage, fixed);
  requireThat(stage?.phase === "callback_pending" && stage.expires > Date.now(), "installation_transaction_expired", 403);
  requireThat(stage.redirect === redirect && typeof fixed.integrationId === "string", "installation_callback_denied", 403);
  await journal.set("bootstrap", { ...stage, integrationId: fixed.integrationId, phase: "exchange_started" });
  const response = await fetcher("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: fixed.integrationId, client_secret: store.loadForRuntime("INTEGRATION_CLIENT_SECRET"), code, redirect_uri: redirect }),
  });
  requireThat(response.ok, "installation_exchange_failed", 403);
  const issued = await boundedResponse(response, 32768);
  requireThat(typeof issued.access_token === "string" && typeof issued.installation_id === "string", "installation_exchange_unknown", 503);
  const integrationApi = vercelTransport({ token: issued.access_token, teamId: fixed.teamId, fetcher });
  const grant = await integrationApi("GET", `/v1/integrations/configuration/${encodeURIComponent(issued.installation_id)}`);
  const bound = { ...fixed, installationId: issued.installation_id };
  validateInstallation(grant, bound);
  const project = await integrationApi("GET", `/v9/projects/${fixed.projectId}`);
  requireThat(project.accountId === fixed.teamId && project.id === fixed.projectId, "installation_project_denied", 403);
  await verifyOwner(api, bound);
  // Persist only the installation identity before touching the OS store. A crash
  // after native staging can then recover without exchanging the code twice.
  await journal.set("bootstrap", { ...stage, integrationId: fixed.integrationId, phase: "exchange_started", installationId: issued.installation_id });
  store.set("INTEGRATION_TOKEN", issued.access_token);
  await journal.set("bootstrap", { ...stage, integrationId: fixed.integrationId, phase: "token_staged", installationId: issued.installation_id });
  return installStagedGrant({ api, fixed: bound, journal, store, fetcher });
}
export async function installStagedGrant({ api, fixed, journal, store, fetcher = fetch, reapply = false }) {
  await verifyOwner(api, fixed);
  const stage = await journal.get("bootstrap");
  verifyTransaction(stage, fixed);
  requireThat(stage?.expires > Date.now() && ["exchange_started", "token_staged", "admin_write_attempted", "admin_configured"].includes(stage.phase), "installation_transaction_expired", 403);
  requireThat(typeof stage.installationId === "string" && (!fixed.installationId || fixed.installationId === stage.installationId), "installation_binding_changed", 403);
  fixed = { ...fixed, installationId: stage.installationId };
  const token = store.loadForRuntime("INTEGRATION_TOKEN"); requireThat(token, "staged_grant_missing", 409);
  const integrationApi = vercelTransport({ token, teamId: fixed.teamId, fetcher });
  validateInstallation(await integrationApi("GET", `/v1/integrations/configuration/${fixed.installationId}`), fixed);
  const project = await integrationApi("GET", `/v9/projects/${fixed.projectId}`);
  requireThat(project.accountId === fixed.teamId && project.id === fixed.projectId, "installation_project_denied", 403);
  await journal.set("bootstrap", { ...stage, phase: "admin_write_attempted" });
  for (const [key, value, secret] of [["CONNECTIONS_INTEGRATION_TOKEN", token, true], ["CONNECTIONS_INSTALLATION_ID", fixed.installationId, false], ["CONNECTIONS_INTEGRATION_ID", fixed.integrationId, false]]) {
    await verifyOwner(api, fixed);
    await writeSetupConfiguration({ api, journal, projectId: fixed.adminProjectId, key, value, secret, reapply });
  }
  await journal.set("bootstrap", { ...stage, phase: "admin_configured" });
  return { status: "admin_configured", installationId: fixed.installationId };
}
export async function installationListener({ api, fixed, journal, store, port = 0, fetcher = fetch, onInstalled = () => {} }) {
  await verifyOwner(api, fixed);
  const nonce = randomBytes(32).toString("base64url"), cookie = randomBytes(32).toString("base64url");
  const expires = Date.now() + 30 * 60000; let initiated = false, used = false, redirect;
  const server = createServer(async (request, response) => {
    const reply = (status, text) => { response.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" }); response.end(text); };
    try {
      const url = new URL(request.url, redirect);
      requireThat(request.method === "GET" && request.socket.remoteAddress === "127.0.0.1" && request.headers.host === new URL(redirect).host && url.pathname === `/install/${nonce}` &&
        !Object.keys(request.headers).some((key) => key === "forwarded" || key.startsWith("x-forwarded-")), "installation_callback_denied", 403);
      requireThat(Date.now() < expires && !used, "installation_transaction_expired", 403);
      if (!url.search) {
        requireThat(!initiated, "installation_already_started", 409); initiated = true;
        response.setHeader("set-cookie", `gtm_install=${cookie}; HttpOnly; SameSite=Lax; Path=/install/${nonce}; Max-Age=1800`);
        response.writeHead(302, { location: `https://vercel.com/integrations/${encodeURIComponent(fixed.integrationSlug)}/new`, "cache-control": "no-store", "referrer-policy": "no-referrer" }); return response.end();
      }
      const sentCookie = request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("gtm_install="))?.slice(12);
      requireThat(initiated && equal(sentCookie, cookie) && url.searchParams.getAll("code").length === 1 && url.searchParams.get("code"), "installation_callback_denied", 403);
      used = true;
      const saved = await installGrant({ api, fixed, journal, store, code: url.searchParams.get("code"), redirect, fetcher });
      reply(200, "Installation saved. Local setup will continue automatically.");
      onInstalled(saved);
    } catch { reply(403, "Installation could not be completed. Resume trusted local setup."); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  redirect = `http://localhost:${server.address().port}/install/${nonce}`;
  await journal.set("bootstrap", { phase: "callback_pending", expires, redirect, ownerId: fixed.ownerId, teamId: fixed.teamId, projectId: fixed.projectId, adminProjectId: fixed.adminProjectId });
  return { redirect, scopes: INTEGRATION_SCOPES, close: () => new Promise((resolve) => server.close(resolve)) };
}
