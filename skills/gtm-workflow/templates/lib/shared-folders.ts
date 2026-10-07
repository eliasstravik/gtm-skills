import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, type Executor } from "./db";
import { readFolders, readFolderRevision, mutateFolders, folderId, type FolderState, type FolderScope } from "./workflow-folders";
import { deploymentScope } from "./viewer-access";
import { ViewerError } from "./viewer-grants";
import { productionFolderTransport } from "./shared-folder-transport";

/** Only folder commands cross the boundary; scope, URL, registry and arbitrary operations never do. */
export function folderCommand(body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["action", "revision", "id", "parentId", "name", "workflowId"].includes(key)) || !["create", "rename", "move", "delete", "assign"].includes(String(body.action)))
    throw new ViewerError(400, "invalid_action", "Choose a folder action, without a target URL or scope.");
  return body;
}
export function createSharedFolders(transport: (body?: Record<string, unknown>) => Promise<FolderState>, now = Date.now, revisionTransport?: () => Promise<number>) {
  let cached: { at: number; value: Promise<FolderState> } | undefined;
  let revisionCache: { at: number; value: Promise<number> } | undefined;
  let generation = 0;
  const revision = async () => {
    if (!revisionCache || now() - revisionCache.at >= 4000) {
      const value = revisionTransport ? revisionTransport() : Promise.reject(new ViewerError(503, "folders_unavailable", "Shared folder revision is unavailable."));
      revisionCache = { at: now(), value }; void value.catch(() => {});
    }
    return revisionCache.value;
  };
  const read = async () => {
    if (!cached || now() - cached.at >= 4000) {
      const value = transport(); cached = { at: now(), value };
      // Cache failures briefly too: no stale tree is returned, and many open tabs cannot hammer discovery.
      void value.catch(() => {});
    }
    return cached.value;
  };
  return {
    read, revision,
    invalidate(state?: FolderState) { ++generation; cached = state ? { at: now(), value: Promise.resolve(state) } : undefined; revisionCache = state ? { at: now(), value: Promise.resolve(state.revision) } : undefined; },
    async mutate(body: Record<string, unknown>, workflowIds: readonly string[]) {
      folderCommand(body);
      if (body.action === "assign") {
        const id = folderId(body.workflowId);
        if (!workflowIds.includes(id)) {
          // Clearing an existing metadata placeholder is explicit, never a forged new workflow assignment.
          const state = await read();
          if (body.parentId !== null || !Object.hasOwn(state.assignments, id)) throw new ViewerError(404, "workflow_missing", "Choose a workflow in this workspace.");
        }
      }
      ++generation; cached = undefined; revisionCache = undefined;
      const ticket = generation;
      try {
        const state = await transport(body);
        if (ticket === generation) { cached = { at: now(), value: Promise.resolve(state) }; revisionCache = { at: now(), value: Promise.resolve(state.revision) }; }
        return state;
      } catch (error) { cached = undefined; revisionCache = undefined; throw error; }
    },
  };
}
/** First-use standalone folders need no account. Once a link is observed, losing it never selects a writable fallback. */
export function createLocalFolders(options: {
  linked: () => Promise<boolean>; remote: ReturnType<typeof createSharedFolders>;
  readLocal: () => Promise<FolderState>; readLocalRevision?: () => Promise<number>;
  mutateLocal: (body: Record<string, unknown>, ids: readonly string[]) => Promise<FolderState>;
}) {
  let sawLink = false;
  const mode = async (): Promise<"shared" | "local-only"> => {
    if (await options.linked()) { sawLink = true; return "shared"; }
    if (sawLink) throw new ViewerError(503, "folders_unavailable", "The production project link is unavailable. Restore it before changing folders.");
    return "local-only";
  };
  return {
    mode,
    async read() { return await mode() === "shared" ? options.remote.read() : options.readLocal(); },
    async revision() {
      if (await mode() === "shared") return options.remote.revision();
      if (!options.readLocalRevision) throw new ViewerError(503, "folders_unavailable", "Local folder revision is unavailable.");
      return options.readLocalRevision();
    },
    async mutate(body: Record<string, unknown>, ids: readonly string[]) {
      folderCommand(body);
      return await mode() === "shared" ? options.remote.mutate(body, ids) : options.mutateLocal(body, ids);
    },
  };
}
type SharedMarker = { version: 1; projectId: string; orgId: string };
const linkUnavailable = () => new ViewerError(503, "folders_unavailable", "The shared production project link is missing, changed or unreadable. Restore the original link before changing folders.");
function linkIdentity(text: string, marker = false): SharedMarker {
  try {
    if (text.length > (marker ? 512 : 65536)) throw new Error();
    const value = JSON.parse(text);
    if (!/^prj_[a-zA-Z0-9]+$/.test(value.projectId) || !/^team_[a-zA-Z0-9]+$/.test(value.orgId) || (marker && (value.version !== 1 || Object.keys(value).some((key) => !["version", "projectId", "orgId"].includes(key))))) throw new Error();
    return { version: 1, projectId: value.projectId, orgId: value.orgId };
  } catch { throw linkUnavailable(); }
}
/** Nonsecret, gitignored runtime data records that this workspace has entered shared mode. Never contains a token. */
export async function linkedWorkspace(runtime = process.cwd()) {
  const file = join(runtime, "data/workflow-folder-mode.json");
  let marker: SharedMarker | undefined;
  try { marker = linkIdentity(await readFile(file, "utf8"), true); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw linkUnavailable(); }
  let identity: SharedMarker;
  try { identity = linkIdentity(await readFile(join(runtime, ".vercel/project.json"), "utf8")); }
  catch (error) {
    if (marker || (error as NodeJS.ErrnoException).code !== "ENOENT") throw linkUnavailable();
    try { await lstat(join(runtime, ".vercel")); }
    catch (parentError) { if ((parentError as NodeJS.ErrnoException).code === "ENOENT") return false; }
    throw linkUnavailable();
  }
  if (!marker) {
    try { await mkdir(join(runtime, "data"), { recursive: true }); await writeFile(file, JSON.stringify(identity) + "\n", { flag: "wx", mode: 0o600 }); marker = identity; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw linkUnavailable();
      try { marker = linkIdentity(await readFile(file, "utf8"), true); } catch { throw linkUnavailable(); }
    }
  }
  if (marker.projectId !== identity.projectId || marker.orgId !== identity.orgId) throw linkUnavailable();
  return true;
}
const local = createLocalFolders({ linked: linkedWorkspace, remote: createSharedFolders(productionFolderTransport, Date.now, productionFolderTransport.revision), readLocal: () => readFolders(db(), deploymentScope()), readLocalRevision: () => readFolderRevision(db(), deploymentScope()), mutateLocal: (body, ids) => mutateFolders(db(), deploymentScope(), body, ids, { shared: true }) });
function production() {
  const scope = deploymentScope();
  if (process.env.GTM_VIEWER_MODE === "share" || scope.environment !== "production") throw new ViewerError(503, "folders_unavailable", "Shared folders are available only through production.");
  return scope;
}
let hosted: { key: string; cache: ReturnType<typeof createSharedFolders> } | undefined;
function productionCache(scope: FolderScope) {
  const key = JSON.stringify(scope);
  if (!hosted || hosted.key !== key) hosted = { key, cache: createSharedFolders(async () => readFolders(db(), scope), Date.now, () => readFolderRevision(db(), scope)) };
  return hosted.cache;
}
export function rememberProductionFolders(scope: FolderScope, state: FolderState) { productionCache(scope).invalidate(state); }
/** Private viewer adapter. Tests can substitute these functions without network credentials. */
export const folderMetadata = {
  async mode(): Promise<"shared" | "local-only"> { return process.env.VERCEL ? (production(), "shared") : local.mode(); },
  async read(): Promise<FolderState> { return process.env.VERCEL ? productionCache(production()).read() : local.read(); },
  async revision(): Promise<number> { return process.env.VERCEL ? productionCache(production()).revision() : local.revision(); },
  async mutate(body: Record<string, unknown>, workflowIds: readonly string[]) {
    folderCommand(body);
    if (!process.env.VERCEL) return local.mutate(body, workflowIds);
    const scope = production();
    const state = await mutateFolders(db(), scope, body, workflowIds, { shared: true });
    rememberProductionFolders(scope, state);
    return state;
  },
};
/** Dedicated service delegates permanent UUID placement, not workflow execution or registry changes. */
export function delegatedFolderMutation(client: Executor, scope: FolderScope, body: Record<string, unknown>) {
  return mutateFolders(client, scope, folderCommand(body), [], { shared: true, delegated: true });
}
