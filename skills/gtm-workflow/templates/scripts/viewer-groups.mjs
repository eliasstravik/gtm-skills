import ts from "typescript";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLiteral } from "./viewer-registry.mjs";

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * `workflows/groups.ts`, read without running it and checked against the registry: unique ids, a name, every slug a
 * registered workflow, each workflow in at most one group, no empty groups. Returns the groups with workflow slugs
 * replaced by permanent viewer IDs, in file order. A workspace from before groups has no file: no groups.
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
    const workflows = group.workflows.map((slug) => {
      const entry = bySlug.get(slug);
      if (!entry) throw Error(`${where} (${group.id}): no registered workflow ${JSON.stringify(slug)}`);
      if (placed.has(slug)) throw Error(`${where} (${group.id}): ${slug} is already in group ${placed.get(slug)}`);
      placed.set(slug, group.id);
      return entry.id;
    });
    return { id: group.id, name: group.name.trim(), description: group.description?.trim() ?? "", workflows };
  });
}
