import type { Client } from "@libsql/client";
import { fieldsFor, type Entity } from "./schema";

/**
 * Cheap reads of a workflow's population. Turso bills every row scanned, so these go through the indexed side
 * tables (profile_memberships, person_companies), page by key and select only the asked columns. Use them instead
 * of json_each over sources_json or experiences_json, OFFSET paging, or SELECT * (references/cost.md).
 */
type Sql = Pick<Client, "execute">;
const CHUNK = 200;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;
const marks = (values: unknown[]) => values.map(() => "?").join(",");

/** The next page of a workflow's members, by key. Pass the returned `after` back in; null means the last page. */
export async function nextBatch(
  db: Sql,
  workflowId: string,
  entity: Entity,
  options: { after?: string | null; limit: number; columns: string[] },
) {
  const fields = fieldsFor(entity);
  for (const column of options.columns) if (!Object.hasOwn(fields, column)) throw new Error(`Unknown ${entity} field: ${column}`);
  const columns = [...new Set(["key", ...options.columns])];
  const result = await db.execute({
    sql: `SELECT ${columns.map((c) => `p.${q(c)}`).join(", ")} FROM profile_memberships m JOIN ${q(entity)} p ON p.key = m.entity_key WHERE m.workflow_id = ? AND m.entity = ? AND m.entity_key > ? ORDER BY m.entity_key LIMIT ?`,
    args: [workflowId, entity, options.after ?? "", options.limit + 1],
  });
  const rows = result.rows.slice(0, options.limit);
  return { rows, after: result.rows.length > options.limit ? String(rows[rows.length - 1].key) : null };
}

/** Current company keys for each of these people, in chunks. */
export async function companiesOf(db: Sql, personKeys: string[]) {
  const byPerson = new Map<string, string[]>();
  const unique = [...new Set(personKeys)];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const result = await db.execute({
      sql: `SELECT person_key, company_key FROM person_companies WHERE person_key IN (${marks(chunk)}) AND is_current = 1`,
      args: chunk,
    });
    for (const row of result.rows) byPerson.set(String(row.person_key), [...(byPerson.get(String(row.person_key)) ?? []), String(row.company_key)]);
  }
  return byPerson;
}

const currentCompaniesSql =
  "SELECT DISTINCT pc.company_key AS key FROM profile_memberships m JOIN person_companies pc ON pc.person_key = m.entity_key AND pc.is_current = 1 WHERE m.workflow_id = ? AND m.entity = 'people'";

/** Every current company of a workflow's people. One pass over the membership index: load it once per run. */
export async function companyPopulation(db: Sql, workflowId: string) {
  const result = await db.execute({ sql: currentCompaniesSql, args: [workflowId] });
  return result.rows.map((r) => String(r.key)).sort();
}

export type Population = Entity | "current-companies";
/**
 * Progress of a result table over a workflow's population: a result row counts as done, failed when its `error`
 * is set. One index pass, about the size of the population, never a scan of people or companies.
 */
export async function progressCounts(db: Sql, workflowId: string, population: Population, resultTable: string) {
  const members =
    population === "current-companies"
      ? `(${currentCompaniesSql})`
      : "(SELECT entity_key AS key FROM profile_memberships WHERE workflow_id = ? AND entity = ?)";
  const result = await db.execute({
    sql: `SELECT COUNT(*) AS total, COUNT(r.key) AS done, COALESCE(SUM(r.key IS NOT NULL AND r.error IS NULL), 0) AS succeeded, COALESCE(SUM(r.error IS NOT NULL), 0) AS failed FROM ${members} m LEFT JOIN ${q(resultTable)} r ON r.key = m.key`,
    args: population === "current-companies" ? [workflowId] : [workflowId, population],
  });
  const row = result.rows[0];
  const total = Number(row.total);
  const done = Number(row.done);
  return { total, done, remaining: total - done, succeeded: Number(row.succeeded), failed: Number(row.failed) };
}
