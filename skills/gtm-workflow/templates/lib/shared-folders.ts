import { db, type Executor } from "./db";
import { readFolders, mutateFolders, folderId, type FolderState, type FolderScope } from "./workflow-folders";
import { deploymentScope } from "./viewer-access";
import { ViewerError } from "./viewer-grants";
import { productionFolderTransport } from "./shared-folder-transport";

/** Only folder commands cross the boundary; scope, URL, registry and arbitrary operations never do. */
export function folderCommand(body: Record<string, unknown>) {
  if (Object.keys(body).some((key) => !["action", "revision", "id", "parentId", "name", "workflowId"].includes(key)) || !["create", "rename", "move", "delete", "assign"].includes(String(body.action)))
    throw new ViewerError(400, "invalid_action", "Choose a folder action, without a target URL or scope.");
  return body;
}
export function createSharedFolders(transport: (body?: Record<string, unknown>) => Promise<FolderState>, now = Date.now) {
  let cached: { at: number; value: Promise<FolderState> } | undefined;
  let generation = 0;
  const read = async () => {
    if (!cached || now() - cached.at >= 4000) {
      const value = transport(); cached = { at: now(), value };
      // Cache failures briefly too: no stale tree is returned, and many open tabs cannot hammer discovery.
      void value.catch(() => {});
    }
    return cached.value;
  };
  return {
    read,
    invalidate(state?: FolderState) { ++generation; cached = state ? { at: now(), value: Promise.resolve(state) } : undefined; },
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
      ++generation; cached = undefined;
      const ticket = generation;
      try {
        const state = await transport(body);
        if (ticket === generation) cached = { at: now(), value: Promise.resolve(state) };
        return state;
      } catch (error) { cached = undefined; throw error; }
    },
  };
}
const local = createSharedFolders(productionFolderTransport);
function production() {
  const scope = deploymentScope();
  if (process.env.GTM_VIEWER_MODE === "share" || scope.environment !== "production") throw new ViewerError(503, "folders_unavailable", "Shared folders are available only through production.");
  return scope;
}
let hosted: { key: string; cache: ReturnType<typeof createSharedFolders> } | undefined;
function productionCache(scope: FolderScope) {
  const key = JSON.stringify(scope);
  if (!hosted || hosted.key !== key) hosted = { key, cache: createSharedFolders(async () => readFolders(db(), scope)) };
  return hosted.cache;
}
export function rememberProductionFolders(scope: FolderScope, state: FolderState) { productionCache(scope).invalidate(state); }
/** Private viewer adapter. Tests can substitute these functions without network credentials. */
export const folderMetadata = {
  async read(): Promise<FolderState> { return process.env.VERCEL ? productionCache(production()).read() : local.read(); },
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
