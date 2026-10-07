import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { lockNames, writeTransaction, type Executor } from "./db";
import { ViewerError } from "./viewer-grants";
export type FolderScope = { workspace: string; environment: string };
export type Folder = { id: string; parentId: string | null; name: string };
export type FolderState = { revision: number; folders: Folder[]; assignments: Record<string, string> };
const fail = (status: number, code: string, message: string): never => { throw new ViewerError(status, code, message); };
export function folderId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    return fail(400, "invalid_folder", "Choose a valid folder.");
  return value.toLowerCase();
}
export function folderName(value: unknown): string {
  if (typeof value !== "string") return fail(400, "invalid_name", "Enter a folder name.");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 120 || name === "." || name === ".." || /[\/\\\u0000-\u001f\u007f]/.test(name))
    return fail(400, "invalid_name", "Use 1–120 characters, without slashes or control characters.");
  return name;
}
export function validateParent(folders: Folder[], id: string | null, parentId: string | null) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const seen = new Set<string>();
  for (let current = parentId; current; current = byId.get(current)!.parentId) {
    if (current === id || seen.has(current)) fail(409, "folder_cycle", "A folder cannot move inside itself or its descendants.");
    if (!byId.has(current)) fail(404, "folder_missing", "The destination folder no longer exists.");
    seen.add(current);
  }
}
/** One statement gives a consistent tree, assignments and optimistic revision; never returns partial trees. */
export async function readFolders(client: Executor, scope: FolderScope): Promise<FolderState> {
  const { rows } = await client.execute(sql`
    SELECT coalesce((SELECT revision FROM gtm.workflow_folder_scopes WHERE workspace = ${scope.workspace} AND environment = ${scope.environment}), 0)::int AS revision,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parentId', parent_id, 'name', name)), '[]'::jsonb)
       FROM (SELECT id, parent_id, name FROM gtm.workflow_folders WHERE workspace = ${scope.workspace} AND environment = ${scope.environment} ORDER BY name, id LIMIT 10001) f) AS folders,
      (SELECT coalesce(jsonb_object_agg(workflow_id, folder_id), '{}'::jsonb) FROM gtm.workflow_folder_assignments WHERE workspace = ${scope.workspace} AND environment = ${scope.environment}) AS assignments`);
  const state = rows[0] as FolderState;
  if (state.folders.length > 10000) fail(409, "folder_limit", "This workspace has too many folders to display safely.");
  return state;
}
/** Scope-local writes serialise before checking the revision/tree, preventing concurrent cycles and lost moves.
 * authoritativeWorkflowIds must come from this store's server registry, never request input or a proxy client's
 * local registry. A shared production store must use the production registry even for local-origin requests.
 */
export async function mutateFolders(client: Executor, scope: FolderScope, body: Record<string, unknown>, authoritativeWorkflowIds: readonly string[]) {
  if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 0) fail(400, "invalid_revision", "Reload the folders before making changes.");
  return writeTransaction(client, async (tx) => {
    await lockNames(tx, [`workflow-folders:${JSON.stringify([scope.workspace, scope.environment])}`]);
    await tx.execute(sql`INSERT INTO gtm.workflow_folder_scopes (workspace, environment) VALUES (${scope.workspace}, ${scope.environment}) ON CONFLICT DO NOTHING`);
    const state = await readFolders(tx, scope);
    if (state.revision !== body.revision) fail(409, "folder_conflict", "Folders changed in another tab. Reload and try again.");
    const action = body.action;
    const id = action === "create" ? randomUUID() : action === "assign" ? null : folderId(body.id);
    const existing = state.folders.find((f) => f.id === id);
    if (action !== "create" && action !== "assign" && !existing) fail(404, "folder_missing", "The folder no longer exists.");
    if (["create", "rename", "move"].includes(String(action))) {
      const parentId = action === "rename" ? existing!.parentId : body.parentId === null ? null : folderId(body.parentId);
      validateParent(state.folders, id, parentId);
      const name = action === "move" ? existing!.name : folderName(body.name);
      if (state.folders.some((f) => f.id !== id && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()))
        fail(409, "folder_name_conflict", "A folder with that name already exists here.");
      if (action === "create") {
        if (state.folders.length >= 10000) fail(409, "folder_limit", "This workspace has reached its folder limit.");
        await tx.execute(sql`INSERT INTO gtm.workflow_folders (workspace, environment, id, parent_id, name) VALUES (${scope.workspace}, ${scope.environment}, ${id}, ${parentId}, ${name})`);
      } else await tx.execute(sql`UPDATE gtm.workflow_folders SET parent_id = ${parentId}, name = ${name} WHERE workspace = ${scope.workspace} AND environment = ${scope.environment} AND id = ${id}`);
    } else if (action === "delete") {
      const live = new Set(authoritativeWorkflowIds);
      if (state.folders.some((f) => f.parentId === id) || Object.entries(state.assignments).some(([workflowId, folderId]) => folderId === id && live.has(workflowId)))
        fail(409, "folder_not_empty", "Move the workflows and child folders out first. Nothing was deleted.");
      // Only this explicitly deleted folder is cleaned. Live assignments and every other folder are untouched.
      await tx.execute(sql`DELETE FROM gtm.workflow_folder_assignments WHERE workspace = ${scope.workspace} AND environment = ${scope.environment} AND folder_id = ${id} AND NOT (workflow_id = ANY(${sql.param([...live])}::uuid[]))`);
      await tx.execute(sql`DELETE FROM gtm.workflow_folders WHERE workspace = ${scope.workspace} AND environment = ${scope.environment} AND id = ${id}`);
    } else if (action === "assign") {
      const workflowId = folderId(body.workflowId);
      if (!authoritativeWorkflowIds.includes(workflowId)) fail(404, "workflow_missing", "Choose a workflow in this workspace.");
      const parentId = body.parentId === null ? null : folderId(body.parentId);
      validateParent(state.folders, null, parentId);
      if (parentId) await tx.execute(sql`INSERT INTO gtm.workflow_folder_assignments (workspace, environment, workflow_id, folder_id) VALUES (${scope.workspace}, ${scope.environment}, ${workflowId}, ${parentId}) ON CONFLICT (workspace, environment, workflow_id) DO UPDATE SET folder_id = excluded.folder_id`);
      else await tx.execute(sql`DELETE FROM gtm.workflow_folder_assignments WHERE workspace = ${scope.workspace} AND environment = ${scope.environment} AND workflow_id = ${workflowId}`);
    } else fail(400, "invalid_action", "Choose create, rename, move, delete or assign.");
    await tx.execute(sql`UPDATE gtm.workflow_folder_scopes SET revision = revision + 1 WHERE workspace = ${scope.workspace} AND environment = ${scope.environment}`);
    return { ...(await readFolders(tx, scope)), id };
  });
}
