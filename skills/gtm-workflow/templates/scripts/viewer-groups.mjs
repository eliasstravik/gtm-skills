import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLiteral } from "./viewer-registry.mjs";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const startedBy = (entry) => entry.trigger?.startedBy ?? entry.startedBy ?? [];

/**
 * Pipelines, from the code: a workflow that exactly one other registered workflow starts is a stage of it, and shows
 * nested under it. A workflow several others start, or one in a loop of stages, stands on its own. Returns stage slug →
 * the slug of the workflow that starts it.
 */
export function stageParents(entries) {
  const slugs = new Set(entries.map((e) => e.slug)), direct = new Map();
  for (const entry of entries) {
    const by = startedBy(entry);
    if (by.length === 1 && by[0] !== entry.slug && slugs.has(by[0])) direct.set(entry.slug, by[0]);
  }
  const parents = new Map();
  for (const [slug, parent] of direct) {
    const seen = new Set([slug]);
    let at = parent;
    while (at && !seen.has(at)) { seen.add(at); at = direct.get(at); }
    if (!at) parents.set(slug, parent);
  }
  return parents;
}

/** A workflow and every stage below it, depth first, stages in registry order. */
export function withStages(slug, entries, parents = stageParents(entries)) {
  return [slug, ...entries.filter((e) => parents.get(e.slug) === slug).flatMap((e) => withStages(e.slug, entries, parents))];
}

/**
 * `workflows/groups.ts`, read without running it and checked against the registry: unique ids, a name, every slug a
 * registered workflow that no single workflow starts as a stage, each workflow in at most one group, no empty groups.
 * Returns the groups in file order with every member as a permanent viewer ID: each listed workflow followed by its
 * stages, which follow it into the group. A workspace from before groups has no file: no groups.
 */
export function groupsSource(entries, path = resolve("workflows/groups.ts")) {
  if (!existsSync(path)) return [];
  const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  let literal;
  for (const statement of file.statements)
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (declaration.name.text === "groups" && declaration.initializer) literal = declaration.initializer;
  if (!literal) throw Error("workflows/groups.ts must export const groups = [ … ]");
  const value = readLiteral(literal, file);
  return validateGroups(value, entries);
}

export function validateGroups(value, entries) {
  if (!Array.isArray(value)) throw Error("workflows/groups.ts: groups must be a list");
  const bySlug = new Map(entries.map((e) => [e.slug, e])), placed = new Map(), ids = new Set();
  const parents = stageParents(entries);
  return value.map((group, index) => {
    const where = `workflows/groups.ts, group ${index + 1}`;
    if (!group || typeof group !== "object" || Array.isArray(group)) throw Error(`${where}: expected { id, name, description?, workflows }`);
    const unknown = Object.keys(group).filter((key) => !["id", "name", "description", "workflows"].includes(key));
    if (unknown.length) throw Error(`${where}: unknown property ${unknown[0]}`);
    if (typeof group.id !== "string" || !ID.test(group.id)) throw Error(`${where}: id must be lowercase letters, digits and dashes`);
    if (ids.has(group.id)) throw Error(`${where}: duplicate group id ${group.id}`);
    ids.add(group.id);
    if (typeof group.name !== "string" || !group.name.trim() || group.name.length > 80) throw Error(`${where} (${group.id}): name must be 1–80 characters`);
    if (group.description !== undefined && (typeof group.description !== "string" || group.description.length > 280))
      throw Error(`${where} (${group.id}): description must be at most 280 characters`);
    if (!Array.isArray(group.workflows) || !group.workflows.length) throw Error(`${where} (${group.id}): a group needs at least one workflow`);
    const workflows = group.workflows.flatMap((slug) => {
      if (!bySlug.has(slug)) throw Error(`${where} (${group.id}): no registered workflow ${JSON.stringify(slug)}`);
      if (parents.has(slug))
        throw Error(`${where} (${group.id}): ${slug} is a stage of ${parents.get(slug)} and shows under it; remove ${slug} from the list`);
      if (placed.has(slug)) throw Error(`${where} (${group.id}): ${slug} is already in group ${placed.get(slug)}`);
      placed.set(slug, group.id);
      return withStages(slug, entries, parents).map((member) => bySlug.get(member).id);
    });
    return { id: group.id, name: group.name.trim(), description: group.description?.trim() ?? "", workflows };
  });
}
