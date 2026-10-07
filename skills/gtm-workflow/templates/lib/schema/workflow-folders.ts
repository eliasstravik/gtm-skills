import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { gtm } from "./gtm";
export const workflowFolderScopes = gtm.table("workflow_folder_scopes", {
  workspace: text("workspace").notNull(), environment: text("environment").notNull(), revision: integer("revision").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspace, t.environment] })]);
export const workflowFolders = gtm.table("workflow_folders", {
  workspace: text("workspace").notNull(), environment: text("environment").notNull(), id: uuid("id").notNull(), parentId: uuid("parent_id"), name: text("name").notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspace, t.environment, t.id] }),
  foreignKey({ columns: [t.workspace, t.environment], foreignColumns: [workflowFolderScopes.workspace, workflowFolderScopes.environment] }).onDelete("restrict"),
  foreignKey({ columns: [t.workspace, t.environment, t.parentId], foreignColumns: [t.workspace, t.environment, t.id] }).onDelete("restrict"),
  check("workflow_folder_not_self", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  check("workflow_folder_valid_name", sql`length(${t.name}) BETWEEN 1 AND 120 AND ${t.name} = btrim(${t.name}) AND ${t.name} NOT IN ('.', '..') AND ${t.name} !~ '[/\\\\[:cntrl:]]'`),
  uniqueIndex("workflow_folder_sibling_names").on(t.workspace, t.environment, sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.name})`),
]);
export const workflowFolderAssignments = gtm.table("workflow_folder_assignments", {
  workspace: text("workspace").notNull(), environment: text("environment").notNull(), workflowId: uuid("workflow_id").notNull(), folderId: uuid("folder_id").notNull(),
}, (t) => [
  primaryKey({ columns: [t.workspace, t.environment, t.workflowId] }),
  foreignKey({ columns: [t.workspace, t.environment, t.folderId], foreignColumns: [workflowFolders.workspace, workflowFolders.environment, workflowFolders.id] }).onDelete("restrict"),
  index("workflow_folder_assignment_folder").on(t.workspace, t.environment, t.folderId),
]);
