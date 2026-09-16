#!/usr/bin/env node
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceState, privateJson, writePrivateJson } from "../local/state.mjs";
import { nativeStore } from "../local/storage.mjs";
import { localAuth } from "../local/auth.mjs";
import { openBrowser } from "../local/server.mjs";
import { openJournal } from "../src/journal.mjs";
import { requireThat, readJson, safeError } from "../src/errors.mjs";
import { securityHeaders } from "../src/http.mjs";
import { ownerApi } from "./cli.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
import { setupLock } from "./lock.mjs";
import { installationListener, verifyOwner, installStagedGrant, cleanupBootstrap } from "./bootstrap.mjs";

export async function registration(workspace) {
  const state = await workspaceState(workspace), release = await setupLock(state);
  try {
    const instance = await startRegistration(workspace);
    const close = async () => { try { await instance.close(); } finally { await release(); } };
    for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => close().then(() => process.exit(0)));
    return { close, completed: instance.completed };
  } catch (error) { await release(); throw error; }
}
async function startRegistration(workspace) {
  process.umask(0o077);
  const state = await workspaceState(workspace), config = await privateJson(state.configPath), fixed = { ...config.production };
  requireThat(fixed.team && fixed.adminProjectId, "run_hosted_setup", 409);
  const api = ownerApi(fixed.team); await verifyOwner(api, fixed);
  const journal = await openJournal({ url: `file:${state.database}` }), store = nativeStore(`${state.id}/setup`);
  const prior = await journal.get("bootstrap");
  let installed;
  const completed = new Promise((resolve) => { installed = resolve; });
  let listener, server;
  try {
  if (prior && prior.phase !== "complete" && prior.expires <= Date.now()) await cleanupBootstrap({ api, fixed, journal, store });
  const stage = await journal.get("bootstrap");
  const resumable = stage && ["exchange_started", "token_staged", "admin_write_attempted", "admin_configured"].includes(stage.phase);
  if (!resumable && stage?.phase !== "complete") listener = await installationListener({ api, fixed, journal, store, onInstalled: installed });
  if (stage?.phase === "complete") installed({ status: "complete" });
  let auth, origin;
  server = createServer(async (incoming, outgoing) => {
    let response;
    try {
      const request = new Request(`${origin}${incoming.url}`, { method: incoming.method, headers: incoming.headers,
        ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: "half" }) });
      auth.boundary(request, incoming.socket.remoteAddress);
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && ["/", "/registration.js", "/style.css"].includes(path)) {
        const file = path === "/" ? "registration.html" : path.slice(1);
        const target = path === "/style.css" ? new URL("../shared/style.css", import.meta.url) : new URL(file, import.meta.url);
        response = new Response(await readFile(target), { headers: { "content-type": path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html" } });
      } else if (path === "/api/session" && request.method === "POST") {
        const body = await readJson(request); response = Response.json(auth.exchange(body.bootstrap));
      } else {
        auth.authorize(request); await verifyOwner(api, fixed);
        if (path === "/api/details" && request.method === "GET") response = Response.json({ team: fixed.team, project: fixed.workflowName,
          identityCallback: `${fixed.origin}/auth/callback`, integrationCallback: listener?.redirect, scopes: listener?.scopes ?? [],
          identitySettings: `https://vercel.com/${encodeURIComponent(fixed.team)}/~/settings/apps`,
          integrationSettings: "https://vercel.com/dashboard/integrations/console", phase: (await journal.get("bootstrap"))?.phase });
        else if (path === "/api/registration" && request.method === "POST") {
          requireThat(listener, "registration_already_staged", 409);
          const body = await readJson(request);
          requireThat(Object.keys(body).every((key) => ["clientId", "clientSecret", "integrationId", "integrationSecret", "integrationSlug", "identityVerified"].includes(key)), "unknown_field");
          for (const key of ["clientId", "integrationId", "integrationSlug"]) requireThat(typeof body[key] === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(body[key]), "invalid_registration");
          for (const key of ["clientSecret", "integrationSecret"]) requireThat(typeof body[key] === "string" && body[key].length >= 16 && body[key].length <= 4096, "invalid_registration");
          requireThat(body.identityVerified === true, "identity_settings_unverified", 409);
          requireThat(!fixed.integrationId || fixed.integrationId === body.integrationId, "registration_binding_changed", 409);
          requireThat(!fixed.clientId || fixed.clientId === body.clientId, "registration_binding_changed", 409);
          for (const [key, value] of [["INTEGRATION_CLIENT_SECRET", body.integrationSecret], ["IDENTITY_CLIENT_SECRET", body.clientSecret]]) {
            const existing = store.loadForRuntime(key);
            requireThat(!existing || existing === value, "registration_secret_changed", 409);
          }
          store.set("INTEGRATION_CLIENT_SECRET", body.integrationSecret);
          store.set("IDENTITY_CLIENT_SECRET", body.clientSecret);
          fixed.integrationId = body.integrationId; fixed.integrationSlug = body.integrationSlug; fixed.clientId = body.clientId;
          await journal.set("registration", { clientId: body.clientId, integrationId: body.integrationId, integrationSlug: body.integrationSlug, identitySettingsVerified: true });
          await writePrivateJson(state.configPath, { ...config, production: { ...fixed, clientId: body.clientId } });
          for (const [key, value, secret] of [["CONNECTIONS_CLIENT_ID", body.clientId, false], ["CONNECTIONS_CLIENT_SECRET", body.clientSecret, true]]) {
            await verifyOwner(api, fixed);
            await writeSetupConfiguration({ api, journal, projectId: fixed.adminProjectId, key, value, secret });
          }
          body.clientSecret = undefined; body.integrationSecret = undefined;
          response = Response.json({ status: "registration_saved", consent: listener.redirect });
        } else if (path === "/api/resume" && request.method === "POST") {
          const body = await readJson(request);
          requireThat(Object.keys(body).every((key) => key === "reapply") && typeof body.reapply === "boolean", "invalid_resume");
          const saved = await installStagedGrant({ api, fixed, journal, store, reapply: body.reapply });
          fixed.installationId = saved.installationId;
          await writePrivateJson(state.configPath, { ...config, production: fixed });
          response = Response.json(saved);
          setImmediate(() => installed(saved));
        } else requireThat(false, "not_found", 404);
      }
    } catch (error) { const safe = safeError(error); response = Response.json({ error: safe.error }, { status: safe.status }); }
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`; auth = localAuth(origin);
  await openBrowser(auth.opener());
  console.log(JSON.stringify({ status: "human_step", stage: "registration_and_consent", origin, instruction: "Complete the two owner-controlled registrations in the opened local setup page. Keep credentials in its password fields." }));
  const close = async () => { server.closeAllConnections(); await Promise.all([new Promise((resolve) => server.close(resolve)), listener?.close()]); journal.close(); };
  return { close, completed };
  } catch (error) {
    if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await listener?.close(); journal.close(); throw error;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { workspace: { type: "string" } } }); requireThat(values.workspace, "workspace_required");
    const instance = await registration(values.workspace);
    const saved = await instance.completed; await instance.close();
    if (saved.status === "complete") console.log(JSON.stringify(saved));
    else {
      const state = await workspaceState(values.workspace), config = await privateJson(state.configPath);
      await writePrivateJson(state.configPath, { ...config, production: { ...config.production, installationId: saved.installationId } });
      const { setupHosted } = await import("./deploy.mjs");
      const result = await setupHosted({ workspace: values.workspace, team: config.production.team });
      console.log(JSON.stringify(result)); process.exitCode = result.status === "human_step" ? 2 : 0;
    }
  }
  catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
}
