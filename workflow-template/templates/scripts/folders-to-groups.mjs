// `node scripts/folders-to-groups.mjs`: the one-off step of the upgrade from folders to groups. Reads the workspace's
// old workflow folders and placements once and proposes `workflows/groups.ts`; with --write it saves the file, but only
// over one that holds no groups yet. Reads only: the folder tables are left as they are (a later release drops them).
//
//   --source production   production's folders (a linked workspace's only folders), through the owner's neonctl login
//   --source local        this computer's folders (an unlinked workspace), from its local database
//   --source <file.json>  a saved folder state, { folders: [{ id, parentId, name }], assignments: { <workflow id>: <folder id> } }
//   (default: production when workflows/.vercel/project.json links the workspace, else local)
//   --suggest             when there are no folders, propose groups from the code: shared data, shared tables, stages
//   --write               save workflows/groups.ts
//   --json                print the proposal as JSON instead of the file
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { registrySource } from "./viewer-registry.mjs";
import { groupsSource, stageParents, validateGroups } from "./viewer-groups.mjs";

const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEPARATOR = " · ";

/** The text of `workflows/groups.ts` for these groups (slugs). The template's empty file is renderGroups([]). */
export function renderGroups(groups) {
  const body = groups.map((g) => [
    "  {",
    `    id: ${JSON.stringify(g.id)},`,
    `    name: ${JSON.stringify(g.name)},`,
    ...(g.description ? [`    description: ${JSON.stringify(g.description)},`] : []),
    `    workflows: [${g.workflows.map((slug) => JSON.stringify(slug)).join(", ")}],`,
    "  },",
  ].join("\n"));
  return `import type { WorkflowGroup } from "../lib/viewer-contract";
import type { workflows } from "./index";

/**
 * Groups on the Workflows page: maintained by Create, Delete and the agent when asked to regroup. One level, a workflow
 * in at most one group, no empty groups; a workflow in none shows under Ungrouped. Order here is the order on screen.
 * List only workflows that stand on their own: a stage that one workflow starts follows it, nested under it.
 *
 * { id: "linkedin-social", name: "LinkedIn social", description: "Who engages with our posts, scored.",
 *   workflows: ["linkedin-social-monitor", "score-inbound"] },
 */
export const groups = [${body.length ? `\n${body.join("\n")}\n` : ""}] as const satisfies readonly WorkflowGroup<keyof typeof workflows>[];
`;
}

const slugify = (text) => text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "") || "group";
function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base.slice(0, 60)}-${n}`;
  taken.add(id);
  return id;
}

/**
 * Folders and placements to groups: every folder that holds workflows becomes one group named by its path
 * ("Outbound · EMEA"), in tree order; empty folders are dropped; a placement of a workflow this workspace no longer
 * has is reported, not carried over. Workflows inside a group are ordered by title. A stage that one workflow starts is
 * left out: it follows that workflow, wherever it is.
 */
export function foldersToGroups(state, entries) {
  const stages = stageParents(entries);
  const folders = state.folders ?? [], assignments = state.assignments ?? {};
  const byId = new Map(folders.map((f) => [f.id, f]));
  const children = new Map();
  for (const folder of folders) children.set(folder.parentId ?? null, [...(children.get(folder.parentId ?? null) ?? []), folder]);
  for (const list of children.values()) list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const order = [], seen = new Set();
  const stack = (children.get(null) ?? []).slice().reverse().map((folder) => ({ folder, path: [folder.name] }));
  while (stack.length) {
    const item = stack.pop();
    if (seen.has(item.folder.id)) continue;
    seen.add(item.folder.id);
    order.push(item);
    for (const folder of (children.get(item.folder.id) ?? []).slice().reverse()) stack.push({ folder, path: [...item.path, folder.name] });
  }
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const missing = [], placed = new Map();
  for (const [workflowId, folderId] of Object.entries(assignments)) {
    const entry = entryById.get(workflowId);
    if (!entry) { missing.push({ workflowId, folder: order.find((o) => o.folder.id === folderId)?.path.join(SEPARATOR) ?? folderId }); continue; }
    if (!byId.has(folderId)) continue;
    placed.set(folderId, [...(placed.get(folderId) ?? []), entry]);
  }
  const taken = new Set(), groups = [], emptyFolders = [];
  for (const { folder, path } of order) {
    const members = placed.get(folder.id)?.filter((e) => !stages.has(e.slug));
    if (!placed.get(folder.id)?.length) { emptyFolders.push(path.join(SEPARATOR)); continue; }
    if (!members.length) continue;
    const name = path.join(SEPARATOR);
    groups.push({
      id: uniqueId(slugify(name), taken),
      name: name.length > 80 ? `${name.slice(0, 79)}…` : name,
      workflows: members.sort((a, b) => a.title.localeCompare(b.title) || a.slug.localeCompare(b.slug)).map((e) => e.slug),
    });
  }
  return { groups, missing, emptyFolders };
}

const RUNTIME_TABLES = new Set(["people", "companies", "cache", "profileIdentifiers", "profile_identifiers"]);
/**
 * No folders: clusters of workflows that belong together by the code alone. Two workflows join when one starts the
 * other as a stage, when they share an authored data definition, or when they write the same workflow table (the shared
 * people and companies records do not count: unrelated workflows all fill them). Only clusters of two or more are
 * proposed; the agent names them, and may add single-workflow groups, before saving. A group lists only workflows
 * that stand on their own; their stages follow them.
 */
export function suggestGroups(entries) {
  const stages = stageParents(entries);
  const parent = new Map(entries.map((e) => [e.slug, e.slug]));
  const find = (slug) => { while (parent.get(slug) !== slug) slug = parent.get(slug); return slug; };
  const join = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
  const owners = new Map();
  for (const entry of entries) {
    for (const by of entry.startedBy ?? []) join(entry.slug, by);
    const keys = [
      ...(entry.data ? [`data:${JSON.stringify(entry.data.tables?.map((t) => t.name).sort())}`] : []),
      ...[...(entry.data?.tables?.map((t) => t.name) ?? []), ...(entry.resultTables ?? [])].filter((t) => !RUNTIME_TABLES.has(t)).map((t) => `table:${t}`),
    ];
    for (const key of keys) owners.has(key) ? join(entry.slug, owners.get(key)) : owners.set(key, entry.slug);
  }
  const clusters = new Map();
  for (const entry of entries) clusters.set(find(entry.slug), [...(clusters.get(find(entry.slug)) ?? []), entry]);
  const taken = new Set();
  return [...clusters.values()].filter((members) => members.length > 1).map((members) => {
    // A workflow that starts others first, then the rest in the order they were registered; stages follow their own.
    const lead = members.find((m) => members.some((o) => o.startedBy?.includes(m.slug))) ?? members[0];
    const ordered = [lead, ...members.filter((m) => m !== lead)].filter((m) => !stages.has(m.slug));
    return { id: uniqueId(slugify(lead.title), taken), name: lead.title.slice(0, 80), workflows: ordered.map((m) => m.slug) };
  });
}

/** One scope's folders: production's project, or this computer's. Tables that were never created mean no folders. */
export async function readFolderState(connectionString, scope) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  await client.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    const exists = (await client.query("SELECT to_regclass('gtm.workflow_folders') IS NOT NULL AS present")).rows[0].present;
    if (!exists) return { folders: [], assignments: {}, scopes: [] };
    const scopes = (await client.query("SELECT DISTINCT workspace, environment FROM gtm.workflow_folders WHERE environment = $1", [scope.environment])).rows;
    const workspace = scope.workspace ?? (scopes.length === 1 ? scopes[0].workspace : undefined);
    if (!workspace && scopes.length > 1) throw new Error(`Folders exist for several ${scope.environment} projects (${scopes.map((s) => s.workspace).join(", ")}); link the workspace or pass --source <file>.`);
    const folders = (await client.query("SELECT id, parent_id AS \"parentId\", name FROM gtm.workflow_folders WHERE workspace = $1 AND environment = $2", [workspace, scope.environment])).rows;
    const assignments = Object.fromEntries((await client.query("SELECT workflow_id, folder_id FROM gtm.workflow_folder_assignments WHERE workspace = $1 AND environment = $2", [workspace, scope.environment])).rows.map((r) => [r.workflow_id, r.folder_id]));
    return { folders, assignments, scopes };
  } finally { await client.end(); }
}

async function load(source) {
  if (source !== "production" && source !== "local") {
    const value = JSON.parse(readFileSync(resolve(source), "utf8"));
    // A saved viewer list answer carries the state under `folders`.
    return value.folders && !Array.isArray(value.folders) ? value.folders : value;
  }
  if (source === "production") {
    const { productionUrl } = await import("./db-pull.mjs");
    const link = JSON.parse(readFileSync(join(cwd, ".vercel/project.json"), "utf8"));
    return readFolderState(productionUrl(), { environment: "production", workspace: link.projectId });
  }
  const { localDatabaseUrl, ensureLocalDatabase } = await import("./local-database.mjs");
  const scope = { environment: "local", workspace: process.env.GTM_VIEWER_WORKSPACE ?? "local" };
  const running = await localDatabaseUrl(cwd).catch(() => undefined);
  if (running) return readFolderState(running, scope);
  const database = await ensureLocalDatabase(cwd, { create: false });
  try { return await readFolderState(database.url, scope); } finally { await database.stop(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { source: { type: "string" }, suggest: { type: "boolean" }, write: { type: "boolean" }, json: { type: "boolean" } } });
  try {
    process.chdir(cwd);
    const entries = registrySource();
    const target = join(cwd, "workflows/groups.ts");
    const current = existsSync(target) ? groupsSource(entries, target) : [];
    const source = values.source ?? (existsSync(join(cwd, ".vercel/project.json")) ? "production" : "local");
    const state = await load(source);
    const result = foldersToGroups(state, entries);
    const suggested = !result.groups.length && values.suggest;
    const groups = suggested ? suggestGroups(entries) : result.groups;
    const proposal = { source, folders: (state.folders ?? []).length, groups, suggested: Boolean(suggested), missing: result.missing, emptyFolders: result.emptyFolders, existingGroups: current.length };
    if (values.json) console.log(JSON.stringify(proposal, null, 2));
    else {
      console.log(`Read ${proposal.folders} folder(s) from ${source}.`);
      if (result.emptyFolders.length) console.log(`Dropped ${result.emptyFolders.length} empty folder(s): ${result.emptyFolders.join("; ")}`);
      for (const m of result.missing) console.log(`Not carried over: workflow ${m.workflowId} in "${m.folder}" is not in this workspace.`);
      if (suggested) console.log("No folders hold workflows; these groups come from the code (shared data, tables and stages). Name them before saving.");
      else if (!groups.length) console.log("No folders hold workflows. Run again with --suggest to propose groups from the code.");
      console.log(`\n${renderGroups(groups)}`);
    }
    if (values.write) {
      if (current.length) throw new Error("workflows/groups.ts already has groups; nothing was written. Edit it instead.");
      if (groups.length) {
        validateGroups(groups, entries);
        writeFileSync(target, renderGroups(groups));
        console.log(`Wrote workflows/groups.ts with ${groups.length} group(s). Review the diff, then build and commit.`);
      } else console.log("Nothing to write.");
    }
  } catch (error) {
    console.error(error?.name === "LocalDatabaseError" ? error.message : error.message ?? error);
    process.exitCode = 1;
  }
}
