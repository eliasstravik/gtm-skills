import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ViewerError } from "./viewer-grants";
import type { FolderState } from "./workflow-folders";
const exec = promisify(execFile);
const unavailable = () => new ViewerError(503, "folders_unavailable", "Shared folders are unavailable. Connect to production and try again; no local folder changes were saved.");
const MAX_RESPONSE = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function folderState(value: any): FolderState {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.folders) || value.folders.length > 10000 || !value.assignments || typeof value.assignments !== "object" || Array.isArray(value.assignments)) throw unavailable();
  const ids = new Set<string>();
  for (const f of value.folders) {
    if (!uuid.test(f.id) || ids.has(f.id) || (f.parentId !== null && !uuid.test(f.parentId)) || typeof f.name !== "string" || !f.name.length || f.name.length > 120) throw unavailable();
    ids.add(f.id);
  }
  const entries = Object.entries(value.assignments);
  if (entries.length > 10000 || entries.some(([id, folder]) => !uuid.test(id) || typeof folder !== "string" || !ids.has(folder))) throw unavailable();
  const parents = new Map(value.folders.map((f: any) => [f.id, f.parentId]));
  const done = new Set<string>();
  for (const f of value.folders) {
    const path = new Set<string>();
    for (let id: string | null = f.id; id && !done.has(id); id = parents.get(id) as string | null) {
      if (!ids.has(id) || path.has(id)) throw unavailable();
      path.add(id);
    }
    for (const id of path) done.add(id);
  }
  return { revision: value.revision, folders: value.folders.map((f: any) => ({ id: f.id, parentId: f.parentId, name: f.name })), assignments: Object.fromEntries(entries) as Record<string, string> };
}
export type FolderTransportDependencies = {
  runtime: string; configDirectory: string;
  read: (path: string) => Promise<string>;
  repository: () => Promise<{ root: string; remote: string }>;
  fetch: typeof fetch; now: () => number;
};
function repositoryName(remote: string) {
  const match = remote.trim().match(/^(?:https?:\/\/(?:github\.com|github\.localhost)\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw unavailable();
  return match[1];
}
async function json(response: Response) {
  if (response.status >= 300 && response.status < 400) throw unavailable();
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > MAX_RESPONSE) throw unavailable(); chunks.push(next.value); }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally { await reader.cancel(); }
}
/** Only trusted server-local link/config files choose the target. Never accepts a URL, scope or credential from a browser. */
export function createFolderTransport(deps: FolderTransportDependencies) {
  let target: { at: number; value: Promise<{ origin: string; bypass: string }> } | undefined;
  async function discover() {
    const link = JSON.parse(await deps.read(join(deps.runtime, ".vercel/project.json")));
    if (!/^prj_[a-zA-Z0-9]+$/.test(link.projectId) || !/^team_[a-zA-Z0-9]+$/.test(link.orgId)) throw unavailable();
    const config = JSON.parse(await deps.read(join(deps.configDirectory, "config.json")));
    const auth = JSON.parse(await deps.read(join(deps.configDirectory, "auth.json")));
    const api = new URL(config.api || "https://api.vercel.com");
    if (api.protocol !== "https:" || api.origin !== api.href.replace(/\/$/, "") || api.username || api.password || typeof auth.token !== "string" || !auth.token) throw unavailable();
    const call = async (path: string) => {
      const response = await deps.fetch(`${api.origin}${path}?teamId=${encodeURIComponent(link.orgId)}`, { headers: { authorization: `Bearer ${auth.token}` }, redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw unavailable();
      return json(response);
    };
    const p = await call(`/v9/projects/${encodeURIComponent(link.projectId)}`);
    const repo = await deps.repository();
    const root = relative(resolve(repo.root), resolve(deps.runtime)).replaceAll("\\", "/");
    if (p.id !== link.projectId || p.accountId !== link.orgId || p.rootDirectory !== root || root.startsWith("..") || p.link?.type !== "github" || `${p.link.org}/${p.link.repo}` !== repositoryName(repo.remote) || p.link.productionBranch !== "main" || !p.targets?.production?.id) throw unavailable();
    const bypasses = Object.entries(p.protectionBypass ?? {}).filter(([, value]: any) => value.scope === "automation-bypass");
    if (bypasses.length !== 1 || !bypasses[0][0]) throw unavailable();
    const domains = (await call(`/v9/projects/${encodeURIComponent(link.projectId)}/domains`)).domains;
    if (!Array.isArray(domains)) throw unavailable();
    const names = domains.filter((d: any) => !d.redirect && !d.gitBranch && !d.customEnvironmentId && d.verified === true && typeof d.name === "string" && /^[a-z0-9.-]+$/i.test(d.name)).map((d: any) => d.name as string)
      .sort((a: string, b: string) => Number(a.endsWith(".vercel.app")) - Number(b.endsWith(".vercel.app")) || a.length - b.length || a.localeCompare(b));
    if (!names.length) throw unavailable();
    return { origin: `https://${names[0]}`, bypass: bypasses[0][0] };
  }
  return async (body?: Record<string, unknown>): Promise<FolderState> => {
    try {
      if (!target || deps.now() - target.at >= 60000) target = { at: deps.now(), value: discover() };
      const { origin, bypass } = await target.value;
      const response = await deps.fetch(`${origin}/api/workflow-folders`, { method: body ? "POST" : "GET", headers: { "x-vercel-protection-bypass": bypass, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(8000) });
      const data = await json(response);
      if (!response.ok) {
        // Never relay remote messages, headers, tokens or exception details. Only known business failures cross this boundary.
        const messages: Record<string, string> = { folder_conflict: "Folders changed in another tab. Reload and try again.", folder_cycle: "A folder cannot move inside itself or its descendants.", folder_not_empty: "Move all placements and child folders out first. Nothing was deleted.", folder_name_conflict: "A folder with that name already exists here.", folder_missing: "The folder no longer exists.", invalid_name: "Enter a valid folder name.", invalid_folder: "Choose a valid folder.", invalid_revision: "Reload the folders before making changes.", folder_limit: "The workspace folder limit was reached.", workflow_missing: "Choose a workflow in this workspace." };
        if (messages[data.error?.code] && [400, 404, 409].includes(response.status)) throw new ViewerError(response.status, data.error.code, messages[data.error.code]);
        throw unavailable();
      }
      if (data.version !== 1) throw unavailable();
      return folderState(data.folders);
    } catch (error) {
      if (error instanceof ViewerError && error.code !== "folders_unavailable") throw error;
      target = undefined;
      throw unavailable();
    }
  };
}
const runtime = resolve(process.cwd());
const configDirectory = process.platform === "win32" ? join(process.env.APPDATA || homedir(), "com.vercel.cli") : process.platform === "darwin" ? join(homedir(), "Library/Application Support/com.vercel.cli") : join(process.env.XDG_DATA_HOME || join(homedir(), ".local/share"), "com.vercel.cli");
export const productionFolderTransport = createFolderTransport({ runtime, configDirectory, read: (path) => readFile(path, "utf8"), repository: async () => ({ root: (await exec("git", ["rev-parse", "--show-toplevel"], { cwd: runtime })).stdout.trim(), remote: (await exec("git", ["remote", "get-url", "origin"], { cwd: runtime })).stdout.trim() }), fetch: (...args) => fetch(...args), now: Date.now });
