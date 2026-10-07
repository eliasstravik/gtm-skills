import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createFolderTransport, folderState, type FolderTransportDependencies } from "../templates/lib/shared-folder-transport";
import { createSharedFolders, createLocalFolders, linkedWorkspace, folderCommand, folderMetadata } from "../templates/lib/shared-folders";
import { readFolders, readFolderRevision, mutateFolders } from "../templates/lib/workflow-folders";
import { folderEntries, FolderWorkflow } from "../templates/viewer/workspace";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { privateAccess, requireMutation, boundedJson, csrfCookie, csrfNonce } from "../templates/lib/viewer-access";
import { viewerApi } from "../templates/lib/viewer-handler";
import { sharedFolderService } from "../templates/lib/shared-folder-service";
import { registry } from "../templates/lib/viewer-reader";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, db, readBytes, resetReadBytes } from "../templates/lib/db";
import { ViewerError } from "../templates/lib/viewer-grants";
import { testDatabase } from "./db";
const database = await testDatabase(); after(closeDb);
const scope = { workspace: "prj_fixture", environment: "production" };
const bypass = "fixture-bypass-never-a-real-credential";
const api = "https://vercel-api.example", origin = "https://production.example";
let clock = 0;
function deps(overrides: Partial<FolderTransportDependencies> = {}): FolderTransportDependencies {
  return {
    runtime: "/fixture/workflows", configDirectory: "/fixture/cli", now: () => clock,
    read: async (path) => JSON.stringify(path.endsWith("project.json") ? { projectId: "prj_fixture", orgId: "team_fixture" } : path.endsWith("config.json") ? { api } : { token: "fixture-api-token" }),
    repository: async () => ({ root: "/fixture", remote: "http://github.localhost/example/gtm-fixture.git" }),
    fetch: async (input, options) => {
      const url = String(input);
      if (url === `${api}/v9/projects/prj_fixture?teamId=team_fixture`) {
        assert.equal(new Headers(options?.headers).get("authorization"), "Bearer fixture-api-token");
        return Response.json({ id: "prj_fixture", accountId: "team_fixture", rootDirectory: "workflows", link: { type: "github", org: "example", repo: "gtm-fixture", productionBranch: "main" }, targets: { production: { id: "dpl_fixture" } }, protectionBypass: { [bypass]: { scope: "automation-bypass" } } });
      }
      if (url === `${api}/v9/projects/prj_fixture/domains?teamId=team_fixture`) return Response.json({ domains: [{ name: "production.example", verified: true }, { name: "preview.example", verified: true, gitBranch: "feature" }] });
      assert.ok([`${origin}/api/workflow-folders`, `${origin}/api/workflow-folders?revision=1`].includes(url));
      assert.equal(options?.redirect, "error");
      assert.equal(new Headers(options?.headers).get("x-vercel-protection-bypass"), bypass);
      return url.endsWith("?revision=1") ? Response.json({ version: 1, revision: 0 }) : Response.json({ version: 1, folders: { revision: 0, folders: [], assignments: {} } });
    }, ...overrides,
  };
}
async function startBackend() {
  const child = spawn(process.execPath, [process.env.GTM_SHARED_FOLDER_BACKEND!], { env: { ...process.env, VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: scope.workspace, GTM_VIEWER_PROTECTED: "1", VERCEL_AUTOMATION_BYPASS_SECRET: bypass }, stdio: ["ignore", "pipe", "pipe"] });
  const line = await new Promise<string>((resolve, reject) => { let output = ""; child.stdout.on("data", (chunk) => { output += chunk; if (output.includes("\n")) resolve(output.split("\n")[0]); }); child.on("exit", () => reject(new Error("backend fixture exited"))); });
  const backend = `http://127.0.0.1:${JSON.parse(line).port}`;
  return { backend, async close() { child.kill("SIGTERM"); await once(child, "exit"); } };
}
async function consumer(store: ReturnType<typeof createSharedFolders>, ids: string[]) {
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const req = new Request(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
    try {
      await privateAccess(req);
      if (req.method === "POST") await requireMutation(req);
      const folders = req.method === "POST" ? await store.mutate(await boundedJson(req), ids) : await store.read();
      outgoing.writeHead(200, { "content-type": "application/json" }); outgoing.end(JSON.stringify({ folders }));
    } catch (error) {
      outgoing.writeHead(error instanceof ViewerError ? error.status : 503, { "content-type": "application/json" }); outgoing.end(JSON.stringify({ error: { code: error instanceof ViewerError ? error.code : "unavailable" } }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`, token = csrfCookie();
  return { url, read: async () => (await fetch(url)).json(), change: async (body: any, headers: Record<string, string> = {}) => { const r = await fetch(url, { method: "POST", headers: { origin: url, "content-type": "application/json", cookie: `gtm_viewer_csrf=${token.value}`, "x-gtm-csrf": token.value, ...headers }, body: JSON.stringify(body) }); return { status: r.status, ...await r.json() }; }, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
test("unlinked first-use folders work without credentials; incomplete/linked/offline projects never select a local fallback", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "shared-folder-link-fixture-"));
  const standaloneScope = { workspace: "standalone-first-use", environment: "local" };
  let remoteCalls = 0, localWrites = 0;
  const adapter = createLocalFolders({ linked: () => linkedWorkspace(runtime), remote: createSharedFolders(async () => { remoteCalls++; throw new ViewerError(503, "folders_unavailable", "Fixture offline"); }), readLocal: () => readFolders(db(), standaloneScope), mutateLocal: (body, ids) => { localWrites++; return mutateFolders(db(), standaloneScope, body, ids, { shared: true }); } });
  try {
    assert.equal(await adapter.mode(), "local-only");
    assert.deepEqual(await adapter.read(), { revision: 0, folders: [], assignments: {} });
    const local = await adapter.mutate({ action: "create", name: "First-use", parentId: null, revision: 0 }, []);
    assert.equal(local.folders.length, 1); assert.equal(localWrites, 1); assert.equal(remoteCalls, 0);
    await mkdir(join(runtime, ".vercel"));
    await assert.rejects(adapter.read(), (e: any) => e.code === "folders_unavailable");
    await writeFile(join(runtime, ".vercel/project.json"), JSON.stringify({ projectId: "prj_fixture", orgId: "team_fixture" }));
    assert.equal(await adapter.mode(), "shared");
    await assert.rejects(adapter.read(), (e: any) => e.status === 503);
    await assert.rejects(adapter.mutate({ action: "create", name: "No fallback", parentId: null, revision: 1 }, []), (e: any) => e.status === 503);
    assert.equal(localWrites, 1); assert.deepEqual(await readFolders(db(), standaloneScope), folderState(local));
    assert.ok(remoteCalls >= 2);
    await rm(join(runtime, ".vercel"), { recursive: true });
    await assert.rejects(adapter.read(), (e: any) => e.code === "folders_unavailable"); // Observed link loss cannot silently re-enable local edits.
    assert.equal(localWrites, 1);
    const marker = JSON.parse(await readFile(join(runtime, "data/workflow-folder-mode.json"), "utf8"));
    assert.deepEqual(marker, { version: 1, projectId: "prj_fixture", orgId: "team_fixture" });
    const restarted = createLocalFolders({ linked: () => linkedWorkspace(runtime), remote: createSharedFolders(async () => { throw new Error("offline"); }), readLocal: () => readFolders(db(), standaloneScope), mutateLocal: async () => { localWrites++; return local; } });
    await assert.rejects(restarted.read(), (e: any) => e.status === 503);
    await assert.rejects(restarted.mutate({ action: "create", name: "Restart fallback forbidden", parentId: null, revision: 1 }, []), (e: any) => e.status === 503);
    assert.equal(localWrites, 1);
    await mkdir(join(runtime, ".vercel"));
    await writeFile(join(runtime, ".vercel/project.json"), JSON.stringify({ projectId: "prj_changed", orgId: "team_fixture" }));
    await assert.rejects(restarted.mode(), (e: any) => e.status === 503); // Identity cannot silently change the authoritative store.
    assert.deepEqual(JSON.parse(await readFile(join(runtime, "data/workflow-folder-mode.json"), "utf8")), marker);
  } finally { await rm(runtime, { recursive: true, force: true }); }
});
test("empty unlinked workspace root stays usable and can create local-only folders without an account", async () => {
  const original = { ...folderMetadata }, savedRegistry = registry.splice(0), savedWorkspace = process.env.GTM_VIEWER_WORKSPACE;
  process.env.GTM_VIEWER_WORKSPACE = "empty-unlinked-workspace";
  const adapter = createLocalFolders({ linked: async () => false, remote: createSharedFolders(async () => { throw new Error("Must not discover credentials for first use"); }), readLocal: () => readFolders(db(), { workspace: "empty-unlinked-workspace", environment: "local" }), mutateLocal: (body, ids) => mutateFolders(db(), { workspace: "empty-unlinked-workspace", environment: "local" }, body, ids, { shared: true }) });
  Object.assign(folderMetadata, adapter);
  try {
    const initial = await viewerApi(new Request("http://localhost/api/viewer?v=3&op=list", { headers: { host: "localhost" } }));
    assert.equal(initial.status, 200); const list = await initial.json();
    assert.deepEqual(list.workflows, []); assert.deepEqual(list.folders, { revision: 0, folders: [], assignments: {} }); assert.equal(list.foldersMode, "local-only"); assert.equal(list.foldersEditable, true); assert.equal(list.foldersUnavailable, null);
    const token = list.csrf;
    const create = await viewerApi(new Request("http://localhost/api/viewer?v=3&op=folders", { method: "POST", headers: { host: "localhost", origin: "http://localhost", cookie: `gtm_viewer_csrf=${token}`, "x-gtm-csrf": token, "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: "Empty workspace folder", parentId: null, revision: 0 }) }));
    assert.equal(create.status, 200); assert.equal((await create.json()).folders.folders.length, 1);
    assert.equal((await viewerApi(new Request("http://localhost/api/viewer?v=3&op=workspaceRuns", { headers: { host: "localhost" } }))).status, 200);
  } finally { Object.assign(folderMetadata, original); registry.push(...savedRegistry); savedWorkspace === undefined ? delete process.env.GTM_VIEWER_WORKSPACE : process.env.GTM_VIEWER_WORKSPACE = savedWorkspace; }
});
test("transport resolves only the verified linked repo/root/team/production domain, caches existing credentials in memory", async () => {
  const d = deps(); let requests = 0;
  const transport = createFolderTransport({ ...d, fetch: async (...args) => { requests++; return d.fetch(...args); } });
  assert.equal((await transport()).revision, 0); assert.equal((await transport()).revision, 0);
  assert.equal(requests, 4); // two identity reads once, plus two metadata reads; no credential writes.
  clock += 60001; await transport(); assert.equal(requests, 7);
});
test("target tampering, ambiguous/missing bypass, redirects and remote secrets fail closed", async () => {
  for (const field of ["accountId", "rootDirectory", "id", "link", "protectionBypass"]) {
    const d = deps();
    for (const value of field === "protectionBypass" ? [{}, { a: { scope: "automation-bypass" }, b: { scope: "automation-bypass" } }] : ["wrong"]) {
      const transport = createFolderTransport({ ...d, fetch: async (input, options) => { const r = await d.fetch(input, options); if (String(input).includes("/v9/projects/prj_fixture?")) { const p = await r.json(); p[field] = value; return Response.json(p); } return r; } });
      await assert.rejects(transport(), (e: any) => e.code === "folders_unavailable" && !e.message.includes(bypass));
    }
  }
  for (const response of [new Response(null, { status: 302, headers: { location: "https://evil.example" } }), Response.json({ error: { code: "unauthorized", message: bypass } }, { status: 401 }), Response.json({ version: 1, folders: { revision: 0, folders: [], assignments: { [randomUUID()]: randomUUID() } } })]) {
    const d = deps(); const transport = createFolderTransport({ ...d, fetch: async (input, opts) => String(input).startsWith(origin) ? response : d.fetch(input, opts) });
    await assert.rejects(transport(), (e: any) => e.code === "folders_unavailable" && !e.message.includes(bypass));
  }
  for (const response of [Response.json({ version: 1, revision: -1 }), Response.json({ version: 1, revision: "1" }), Response.json({ version: 1, revision: 1, folders: [] }), new Response(" ".repeat(257))]) {
    const d = deps(); const transport = createFolderTransport({ ...d, fetch: async (input, opts) => String(input).startsWith(origin) ? response : d.fetch(input, opts) });
    await assert.rejects(transport.revision(), (e: any) => e.code === "folders_unavailable");
  }
  assert.throws(() => folderCommand({ action: "create", scope: "other", url: "https://evil.example" }));
  assert.throws(() => folderState({ revision: -1, folders: [], assignments: {} }));
});
test("two real local HTTP consumers share one production backend, including local-only UUIDs and optimistic conflicts", async () => {
  const { backend, close } = await startBackend();
  const d = deps(); let remoteReads = 0;
  const request: typeof fetch = async (input, opts) => {
    if (!String(input).startsWith(origin)) return d.fetch(input, opts);
    remoteReads++; return fetch(backend + "/api/workflow-folders" + new URL(String(input)).search, opts);
  };
  const userAId = randomUUID(), userBId = randomUUID();
  const storeA = createSharedFolders(createFolderTransport({ ...d, fetch: request }), () => clock), storeB = createSharedFolders(createFolderTransport({ ...d, fetch: request }), () => clock);
  const A = await consumer(storeA, [userAId]), B = await consumer(storeB, [userBId]);
  try {
    let state = (await A.read()).folders;
    const created = await A.change({ action: "create", parentId: null, name: "Shared", revision: state.revision });
    assert.equal(created.status, 200); state = created.folders;
    const root = state.folders[0].id;
    assert.deepEqual((await B.read()).folders, state);
    const placed = await A.change({ action: "assign", workflowId: userAId, parentId: root, revision: state.revision });
    assert.equal(placed.status, 200); state = placed.folders;
    clock += 4001;
    assert.deepEqual((await B.read()).folders, state);
    assert.equal(folderEntries([], state)[0].title, "Workflow unavailable in this copy");
    assert.equal(folderEntries([], state)[0].unavailable, true);
    assert.equal((await B.change({ action: "assign", workflowId: randomUUID(), parentId: root, revision: state.revision })).status, 404);
    assert.equal((await B.change({ action: "delete", id: root, revision: state.revision })).status, 409); // Must not erase local-only placements.
    assert.equal((await A.change({ action: "rename", id: root, name: "Evil", revision: state.revision }, { origin: "https://evil.example" })).status, 403);
    assert.equal((await A.change({ action: "rename", id: root, name: "Evil", revision: state.revision }, { "x-gtm-csrf": "wrong" })).status, 403);
    assert.equal((await A.change({ action: "rename", id: root, name: "Evil", workspace: "other", revision: state.revision })).status, 400);
    const concurrent = await Promise.all([A.change({ action: "rename", id: root, name: "A", revision: state.revision }), B.change({ action: "rename", id: root, name: "B", revision: state.revision })]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    state = await readFolders(db(), scope); clock += 4001;
    assert.deepEqual((await A.read()).folders, state); assert.deepEqual((await B.read()).folders, state);
    const before = remoteReads; await Promise.all([storeA.read(), storeA.read(), storeA.read()]); assert.equal(remoteReads, before);
    // Explicitly clear a missing workflow placement; metadata only, even if it still lives in the other copy.
    const clear = await B.change({ action: "assign", workflowId: userAId, parentId: null, revision: state.revision });
    assert.equal(clear.status, 200); assert.equal(clear.folders.assignments[userAId], undefined);
    assert.equal((await B.change({ action: "delete", id: root, revision: clear.folders.revision })).status, 200);
    assert.equal((await fetch(backend + "/api/workflow-folders", { headers: { "x-vercel-protection-bypass": "wrong" } })).status, 401);
    assert.equal((await fetch(backend + "/api/workflow-folders?workspace=other", { headers: { "x-vercel-protection-bypass": bypass } })).status, 400);
    assert.equal((await fetch(backend + "/api/workflow-folders", { headers: { "x-vercel-protection-bypass": bypass, origin: A.url } })).status, 401);
    assert.equal((await fetch(backend + "/api/workflow-folders", { headers: { "x-vercel-trusted-oidc-idp-token": "fixture" } })).status, 401);
  } finally { await A.close(); await B.close(); await close(); }
});
test("shared deletion protects all placements; owner can clear existing unknowns but cannot create them", async () => {
  const s = { workspace: "shared-delete", environment: "production" }, id = randomUUID();
  const created = await mutateFolders(db(), s, { action: "create", name: "Retain", parentId: null, revision: 0 }, [], { shared: true });
  await mutateFolders(db(), s, { action: "assign", workflowId: id, parentId: created.id, revision: 1 }, [], { shared: true, delegated: true });
  await assert.rejects(mutateFolders(db(), s, { action: "delete", id: created.id, revision: 2 }, [], { shared: true }), /Nothing was deleted/);
  await assert.rejects(mutateFolders(db(), s, { action: "assign", workflowId: randomUUID(), parentId: created.id, revision: 2 }, [], { shared: true }), /workspace/);
  await mutateFolders(db(), s, { action: "assign", workflowId: id, parentId: null, revision: 2 }, [], { shared: true });
  await mutateFolders(db(), s, { action: "delete", id: created.id, revision: 3 }, [], { shared: true });
});
test("offline metadata is unavailable without fallback; private handler checks owner/CSRF and preserves local Data/Runs", async () => {
  const original = { ...folderMetadata }; let writes = 0;
  folderMetadata.read = async () => { throw new ViewerError(503, "folders_unavailable", "Offline"); };
  folderMetadata.revision = async () => { throw new ViewerError(503, "folders_unavailable", "Offline"); };
  folderMetadata.mutate = async () => { writes++; throw new ViewerError(503, "folders_unavailable", "Offline"); };
  const request = (op: string, method = "GET", extra: Record<string, string> = {}) => { const token = csrfCookie(); return new Request(`http://localhost/api/viewer?v=3&op=${op}`, { method, headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json", cookie: `gtm_viewer_csrf=${token.value}`, "x-gtm-csrf": token.value, ...extra }, ...(method === "POST" ? { body: JSON.stringify({ action: "create", parentId: null, name: "No offline copy", revision: 0 }) } : {}) }); };
  try {
    assert.equal((await viewerApi(request("folders", "POST", { origin: "https://evil.example" }))).status, 403);
    assert.equal((await viewerApi(request("folders", "POST", { "x-gtm-csrf": "" }))).status, 403);
    assert.equal(writes, 0);
    assert.equal((await viewerApi(request("folders", "POST"))).status, 503);
    assert.equal(writes, 1);
    const list = await (await viewerApi(request("list"))).json(); assert.equal(list.folders, null); assert.equal(list.foldersEditable, false); assert.match(list.foldersUnavailable, /unavailable/);
    assert.equal((await viewerApi(request("workspaceRuns"))).status, 200);
    assert.equal((await viewerApi(request("data"))).status, 200);
    const pulse = await (await viewerApi(request("pulse"))).json(); assert.match(pulse.registry, /unavailable$/);
    Object.assign(process.env, { GTM_VIEWER_TAILNET_OWNER: "owner@example.com", GTM_VIEWER_TAILNET_ORIGIN: "https://vm.example.ts.net" });
    const tail = (login: string) => new Request("http://localhost/api/viewer?v=3&op=folders", { method: "POST", headers: { host: "vm.example.ts.net", origin: "https://vm.example.ts.net", "tailscale-user-login": login, "content-type": "application/json" }, body: "{}" });
    assert.equal((await viewerApi(tail("other@example.com"))).status, 403); assert.equal(writes, 1);
    assert.equal((await viewerApi(tail("owner@example.com"))).status, 403); assert.equal(writes, 1); // Owner still needs CSRF.
    const validToken = csrfCookie();
    const validTail = new Request("http://localhost/api/viewer?v=3&op=folders", { method: "POST", headers: { host: "vm.example.ts.net", origin: "https://vm.example.ts.net", "tailscale-user-login": "owner@example.com", "content-type": "application/json", cookie: `gtm_viewer_csrf=${validToken.value}`, "x-gtm-csrf": validToken.value }, body: JSON.stringify({ action: "create", parentId: null, name: "Online required", revision: 0 }) });
    assert.equal((await viewerApi(validTail)).status, 503); assert.equal(writes, 2); // Verified owner/CSRF reaches transport, never a local DB fallback.
  } finally { Object.assign(folderMetadata, original); delete process.env.GTM_VIEWER_TAILNET_OWNER; delete process.env.GTM_VIEWER_TAILNET_ORIGIN; }
});
test("dedicated service rejects preview/share, invalid auth, query/body scope, browser cookies, non-JSON and oversized mutations", async () => {
  const keys = ["VERCEL", "VERCEL_ENV", "VERCEL_TARGET_ENV", "VERCEL_PROJECT_ID", "GTM_VIEWER_PROTECTED", "VERCEL_AUTOMATION_BYPASS_SECRET", "GTM_VIEWER_MODE"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_ID: scope.workspace, GTM_VIEWER_PROTECTED: "1", VERCEL_AUTOMATION_BYPASS_SECRET: bypass });
  delete process.env.VERCEL_TARGET_ENV; delete process.env.GTM_VIEWER_MODE;
  const req = (body?: string, headers: Record<string, string> = {}, query = "") => new Request(origin + "/api/workflow-folders" + query, { method: body === undefined ? "GET" : "POST", headers: { "x-vercel-protection-bypass": bypass, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, ...(body !== undefined ? { body } : {}) });
  try {
    const before = await readFolders(db(), scope);
    for (const headers of [{ "x-vercel-protection-bypass": "" }, { "x-vercel-protection-bypass": "wrong" }, { "x-vercel-trusted-oidc-idp-token": "fixture" }, { cookie: "vercel-owner=fixture" }, { origin }, { "sec-fetch-site": "same-origin" }]) assert.equal((await sharedFolderService(req(undefined, headers))).status, 401);
    process.env.VERCEL_ENV = "preview"; assert.equal((await sharedFolderService(req())).status, 401); process.env.VERCEL_ENV = "production";
    process.env.GTM_VIEWER_MODE = "share"; assert.equal((await sharedFolderService(req())).status, 401); delete process.env.GTM_VIEWER_MODE;
    process.env.GTM_VIEWER_PROTECTED = "0"; assert.equal((await sharedFolderService(req())).status, 401); process.env.GTM_VIEWER_PROTECTED = "1";
    assert.equal((await sharedFolderService(req(undefined, {}, "?workspace=other"))).status, 400);
    assert.equal((await sharedFolderService(req(undefined, {}, "?revision=1&workspace=other"))).status, 400);
    assert.equal((await sharedFolderService(req(undefined, {}, "?revision=1&revision=1"))).status, 400);
    assert.equal((await sharedFolderService(req("{}", {}, "?revision=1"))).status, 400);
    assert.equal((await sharedFolderService(req(undefined, { "x-vercel-protection-bypass": "wrong" }, "?revision=1"))).status, 401);
    assert.equal((await sharedFolderService(req(JSON.stringify({ action: "create", name: "No", parentId: null, revision: before.revision, scope: "other" })))).status, 400);
    assert.equal((await sharedFolderService(req("{}", { "content-type": "text/plain" }))).status, 415);
    assert.equal((await sharedFolderService(req(" ".repeat(8193)))).status, 413);
    assert.equal((await sharedFolderService(new Request(origin + "/api/workflow-folders", { method: "DELETE", headers: { "x-vercel-protection-bypass": bypass } }))).status, 405);
    assert.deepEqual(await readFolders(db(), scope), before);
    assert.equal((await viewerApi(new Request(origin + "/api/viewer?v=3&op=folders", { method: "POST", headers: { "x-vercel-protection-bypass": bypass }, body: "{}" }), false, true)).status, 403); // Generic service unchanged.
  } finally { for (const key of keys) saved[key] === undefined ? delete process.env[key] : process.env[key] = saved[key]; }
});
test("pulse SQL and authenticated remote revision bytes remain constant with 2000 folders and placements", async (t) => {
  await database.query("INSERT INTO gtm.workflow_folder_scopes (workspace, environment, revision) VALUES ($1, $2, 7) ON CONFLICT (workspace, environment) DO UPDATE SET revision = 7", [scope.workspace, scope.environment]);
  await readFolderRevision(db(), scope); resetReadBytes();
  assert.equal(await readFolderRevision(db(), scope), 7); const small = readBytes();
  let backend = await startBackend();
  const original = { ...folderMetadata }, d = deps(); const bodySizes: number[] = []; let treeCalls = 0;
  const transport = createFolderTransport({ ...d, fetch: async (input, options) => {
    if (!String(input).startsWith(origin)) return d.fetch(input, options);
    const response = await fetch(backend.backend + "/api/workflow-folders" + new URL(String(input)).search, options);
    const text = await response.text(); bodySizes.push(Buffer.byteLength(text));
    return new Response(text, { status: response.status, headers: response.headers });
  } });
  const store = createSharedFolders(transport, () => clock, transport.revision);
  folderMetadata.revision = store.revision;
  folderMetadata.read = async () => { treeCalls++; throw new Error("Pulse must never hydrate a folder tree"); };
  const pulse = () => viewerApi(new Request("http://localhost/api/viewer?v=3&op=pulse", { headers: { host: "localhost" } }));
  try {
    const before = await (await pulse()).text(); assert.match(before, /:7"/); assert.equal(treeCalls, 0);
    await database.query("INSERT INTO gtm.workflow_folders (workspace, environment, id, parent_id, name) SELECT $1, $2, gen_random_uuid(), NULL, 'Folder ' || n FROM generate_series(1, 2000) n", [scope.workspace, scope.environment]);
    await database.query("INSERT INTO gtm.workflow_folder_assignments (workspace, environment, workflow_id, folder_id) SELECT workspace, environment, gen_random_uuid(), id FROM gtm.workflow_folders WHERE workspace = $1 AND environment = $2", [scope.workspace, scope.environment]);
    await database.query("UPDATE gtm.workflow_folder_scopes SET revision = 8 WHERE workspace = $1 AND environment = $2", [scope.workspace, scope.environment]);
    resetReadBytes(); assert.equal(await readFolderRevision(db(), scope), 8); const large = readBytes();
    assert.equal(large.total, small.total); assert.equal(large.statements, 1); assert.ok(large.total < 100, `Revision SQL received ${large.total} bytes`);
    assert.ok(large.shapes.every((s) => !/jsonb_agg|workflow_folder_assignments/.test(s.shape)));
    await backend.close(); backend = await startBackend(); clock += 4001; store.invalidate();
    const afterPulse = await (await pulse()).text(); assert.match(afterPulse, /:8"/);
    assert.equal(Buffer.byteLength(afterPulse), Buffer.byteLength(before));
    assert.equal(bodySizes[0], bodySizes[1]); assert.ok(bodySizes[1] < 64); assert.equal(treeCalls, 0);
    t.diagnostic(`0 vs 2000 folders/placements: SQL revision ${small.total}/${large.total} bytes; remote revision ${bodySizes[0]}/${bodySizes[1]} bytes; pulse ${Buffer.byteLength(before)}/${Buffer.byteLength(afterPulse)} bytes; tree reads ${treeCalls}.`);
    await Promise.all([store.revision(), store.revision()]); assert.equal(bodySizes.length, 2); // Tiny reads coalesce independently from full-tree reads.
    folderMetadata.read = () => transport(); folderMetadata.mode = async () => "shared";
    const list = await (await viewerApi(new Request("http://localhost/api/viewer?v=3&op=list", { headers: { host: "localhost" } }))).json();
    assert.equal(list.folders.folders.length, 2000); assert.equal(Object.keys(list.folders.assignments).length, 2000); assert.equal(list.folders.revision, 8);
    assert.ok(bodySizes[2] > 100000); // Only the changed root list transfers the tree.
  } finally { Object.assign(folderMetadata, original); await backend.close(); }
});
test("owner list and workflow/meta views share one cookie jar without rotating another tab's CSRF nonce", async () => {
  const saved = process.env.GTM_VIEWER_WORKSPACE; process.env.GTM_VIEWER_WORKSPACE = "csrf-two-tabs";
  const server = createServer(async (incoming, outgoing) => {
    const chunks = []; for await (const chunk of incoming) chunks.push(chunk);
    const req = new Request(`http://${incoming.headers.host}${incoming.url}`, { method: incoming.method, headers: incoming.headers as Record<string, string>, ...(incoming.method === "POST" ? { body: Buffer.concat(chunks) } : {}) });
    const response = await viewerApi(req); outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${(server.address() as any).port}`; let cookieJar = "";
  async function get(path: string) {
    const response = await fetch(address + path, { headers: cookieJar ? { cookie: cookieJar } : {} });
    assert.equal(response.status, 200); cookieJar = response.headers.get("set-cookie")!.split(";", 1)[0]; return response.json();
  }
  try {
    const rootTab = await get("/api/viewer?v=3&op=list");
    const workflowTab = await get("/api/viewer?v=3&op=meta&workflow=network");
    assert.equal(workflowTab.csrf, rootTab.csrf);
    const workflowRead = await get("/api/viewer?v=3&op=workflow&workflow=network"); assert.equal(workflowRead.csrf, rootTab.csrf);
    for (const [index, tab] of [rootTab, workflowTab].entries()) {
      const response = await fetch(address + "/api/viewer?v=3&op=folders", { method: "POST", headers: { origin: address, cookie: cookieJar, "x-gtm-csrf": tab.csrf, "content-type": "application/json" }, body: JSON.stringify({ action: "create", name: `Tab ${index}`, parentId: null, revision: index }) });
      assert.equal(response.status, 200); assert.equal((await response.json()).folders.revision, index + 1);
    }
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); saved === undefined ? delete process.env.GTM_VIEWER_WORKSPACE : process.env.GTM_VIEWER_WORKSPACE = saved; }
});
test("CSRF reuses exactly one valid nonce, replaces missing/invalid/ambiguous nonces, and rejects ambiguous mutations", async () => {
  const valid = csrfCookie().value;
  const request = (cookie: string) => new Request("http://localhost/api/viewer?v=3&op=folders", { method: "POST", headers: { host: "localhost", origin: "http://localhost", cookie, "x-gtm-csrf": valid, "content-type": "application/json" }, body: "{}" });
  assert.equal(csrfCookie(request(`other=ok; gtm_viewer_csrf=${valid}`)).value, valid);
  for (const cookie of ["", "other=ok", "gtm_viewer_csrf=short", `gtm_viewer_csrf=${"a".repeat(42)}`, `gtm_viewer_csrf=${"a".repeat(44)}`, `gtm_viewer_csrf=${"+".repeat(43)}`, `gtm_viewer_csrf=${valid}; gtm_viewer_csrf=${valid}`, `gtm_viewer_csrf=${valid}; gtm_viewer_csrf =other`]) {
    const req = request(cookie); assert.equal(csrfNonce(req), undefined); const replacement = csrfCookie(req);
    assert.match(replacement.value, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(replacement.value, valid);
    await assert.rejects(requireMutation(req), (e: any) => e.code === "csrf");
  }
});
test("missing workflow UI is metadata only, with explicit placement clearing and no broken workflow link", () => {
  const id = randomUUID(), folder = randomUUID();
  const state = { revision: 2, folders: [{ id: folder, parentId: null, name: "Shared" }], assignments: { [id]: folder } };
  const w = folderEntries([], state)[0];
  const missing = renderToStaticMarkup(React.createElement(FolderWorkflow, { workflow: w, editable: true, onMove() {} }));
  assert.match(missing, /Workflow unavailable in this copy/); assert.match(missing, /Clear placement/); assert.ok(!missing.includes("<a ")); assert.ok(!missing.includes("href="));
  const known = renderToStaticMarkup(React.createElement(FolderWorkflow, { workflow: { id, title: "Local-only workflow" }, editable: true, onMove() {} }));
  assert.match(known, new RegExp(`workflow=${id}`)); assert.match(known, />Move</);
  assert.equal(folderEntries([{ id, title: "Live" }], state).length, 1);
});
test("read caches coalesce successes and failures, with no stale success fallback", async () => {
  let calls = 0, offline = false;
  const store = createSharedFolders(async () => { calls++; if (offline) throw new Error("fixture outage"); return { revision: 1, folders: [], assignments: {} }; }, () => clock);
  await Promise.all([store.read(), store.read()]); assert.equal(calls, 1);
  offline = true; clock += 4001;
  await assert.rejects(store.read()); await assert.rejects(store.read()); assert.equal(calls, 2);
  offline = false; clock += 4001; assert.equal((await store.read()).revision, 1);
});
