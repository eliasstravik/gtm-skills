import { createServer } from "node:http";
import { Readable } from "node:stream";
import { chmod, unlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { localAuth } from "./auth.mjs";
import { workspaceState, privateJson, writePrivateJson } from "./state.mjs";
import { nativeStore, localStorage, settings } from "./storage.mjs";
import { openJournal } from "../src/journal.mjs";
import { createManager } from "../src/manager.mjs";
import { createHandler } from "../src/http.mjs";
import { boundedResponse } from "../src/vercel.mjs";
import { requireThat } from "../src/errors.mjs";
import { runtimeSnapshot } from "../src/snapshot.mjs";
export function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  const child = spawn(command, [url], { shell: false, stdio: "ignore" });
  return new Promise((resolve, reject) => { child.once("error", () => reject(Error("Open Connections from a local desktop session."))); child.once("exit", (code) => code === 0 ? resolve() : reject(Error("Open Connections from a local desktop session."))); });
}
export async function startLocal(workspace, { open = true, publish = true, stateOptions, store: suppliedStore, environment: suppliedEnvironment } = {}) {
  requireThat(process.platform !== "win32", "windows_private_ipc_not_verified", 503);
  process.umask(0o077);
  const state = await workspaceState(workspace, stateOptions), config = await privateJson(state.configPath);
  requireThat(config?.workspace === state.workspace, "run_local_setup", 409);
  const journal = await openJournal({ url: `file:${state.database}` });
  const store = suppliedStore ?? nativeStore(state.id), environment = suppliedEnvironment ?? await settings(state.workspace);
  const active = async () => {
    const runtime = await privateJson(join(state.directory, "runtime.json"));
    if (!runtime || runtime.workspace !== state.id) return null;
    try { process.kill(runtime.pid, 0); } catch { return null; }
    const url = new URL("/api/connections", runtime.origin);
    requireThat(url.protocol === "http:" && url.hostname === "127.0.0.1", "invalid_runtime_origin");
    const readSecret = store.loadForRuntime("GTM_CONNECTIONS_READ_SECRET");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${readSecret}` } });
    requireThat(response.ok, "runtime_unavailable", 503);
    const snapshot = runtimeSnapshot(await boundedResponse(response));
    requireThat(snapshot.workspace === state.id && snapshot.environment === "local" && snapshot.generation === runtime.generation &&
      typeof runtime.processGeneration === "string" && snapshot.processGeneration === runtime.processGeneration, "runtime_identity_mismatch", 503);
    return snapshot;
  };
  let handler;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const request = new Request(`${origin}${incoming.url}`, { method: incoming.method, headers: incoming.headers,
        ...(["GET", "HEAD"].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: "half" }) });
      const response = await handler(request, incoming.socket.remoteAddress);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch { outgoing.writeHead(503, { "cache-control": "no-store" }); outgoing.end("Connections unavailable."); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`, auth = localAuth(origin);
  const manager = createManager({ journal, storage: localStorage({ journal, store, environment }), active,
    context: { mode: "local", workspace: state.id, workflowsUrl: config.workflowsUrl } });
  handler = createHandler({ mode: "local", origin, manager, auth, publicDirectory: fileURLToPath(new URL("../dist/public", import.meta.url)) });
  const ipcPath = join(state.directory, `m-${randomUUID().slice(0, 8)}.sock`);
  const ipc = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/connections") { response.writeHead(404); return response.end(); }
    try { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(await manager.inventory())); }
    catch { response.writeHead(503); response.end('{"error":"connections_unavailable"}'); }
  });
  let closed = false;
  const close = async () => {
    if (closed) return; closed = true;
    server.closeAllConnections(); ipc.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => ipc.close(resolve))]);
    journal.close(); await unlink(ipcPath).catch(() => {});
  };
  try {
  await new Promise((resolve, reject) => { ipc.once("error", reject); ipc.listen(ipcPath, resolve); }); await chmod(ipcPath, 0o600);
  if (publish) {
    await writePrivateJson(join(state.directory, "manager.json"), { pid: process.pid, origin, ipcPath });
    await writePrivateJson(state.configPath, { ...config, managerOrigin: origin });
  }
  if (open) await openBrowser(auth.opener());
  return { origin, close, manager, auth, state };
  } catch (error) { await close(); throw error; }
}
