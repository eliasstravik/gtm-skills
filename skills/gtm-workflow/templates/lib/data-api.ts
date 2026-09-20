import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { RowPolicy, DataRelation } from "./viewer-contract";

/** Explicit, workflow-scoped views. Column names are Drizzle property names. */
export type WorkflowData = {
  rowPolicies?: Record<string, RowPolicy>;
  tables: {
    name: string;
    label: string;
    columns: string[];
    defaultColumns?: string[];
    searchableColumns?: string[];
    nested?: Record<string, string[]>;
    labelColumn: string;
    fields?: Record<
      string,
      {
        label?: string;
        type?: "text" | "url" | "date" | "number" | "boolean" | "json";
      }
    >;
  }[];
  relations?: DataRelation[];
};
type Registry = Record<string, PgTable>;
/** db() or a transaction; only execute is used, so this module stays free of the database client. */
type Reader = { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> };
type Relation = NonNullable<WorkflowData["relations"]>[number];
type Cell = { value: unknown; href?: string };
export type DataPage = {
  title: string;
  context?: string;
  tabs: { label: string; href: string; current: boolean }[];
  columns: string[];
  rows: Cell[][];
  previous?: string;
  next?: string;
  all: string;
  total: number;
  fields: { id: string; label: string; type: string }[];
  availableFields?: { id: string; label: string; type: string }[];
  keys: string[];
};

const PAGE_SIZE = 25;
const and = (conditions: SQL[]) => (conditions.length ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``);
// A jsonb list column as rows; anything that is not a list counts as empty instead of failing the page.
const elements = (list: SQL) => sql`jsonb_array_elements(CASE WHEN jsonb_typeof(${list}) = 'array' THEN ${list} ELSE '[]'::jsonb END)`;
const memberOf = (sources: SQL, workflowId: string) => sql`${sources} @> ${JSON.stringify([{ workflow_id: workflowId }])}::jsonb`;
const has = (object: object, key: string) =>
  Object.prototype.hasOwnProperty.call(object, key);

export class DataInputError extends Error {}

function cellValue(
  value: unknown,
  field: string,
  nested?: Record<string, string[]>,
) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).toString("hex");
  if (!field.endsWith("_json") || value == null) return value;
  // A jsonb column arrives parsed; a text column that holds JSON is parsed here.
  let parsed: unknown = value;
  if (typeof value === "string")
    try {
      parsed = JSON.parse(value);
    } catch {
      return nested?.[field] ? null : value;
    }
  const allowed = nested?.[field];
  if (!allowed) return parsed;
  // Shared sections expose named scalar leaves only. Original evidence never rides along.
  const project = (item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).filter(
            ([key, v]) =>
              allowed.includes(key) &&
              (v === null ||
                ["string", "number", "boolean"].includes(typeof v)),
          ),
        )
      : allowed.includes("$value") &&
          ["string", "number", "boolean"].includes(typeof item)
        ? item
        : null;
  return Array.isArray(parsed)
    ? parsed.map(project).filter(Boolean)
    : project(parsed);
}

/** The authored row restriction of one table as a condition on `alias`, or undefined when it has none. */
function population(
  config: WorkflowData,
  registry: Registry,
  name: string,
  alias: string,
): SQL | undefined {
  const policy = config.rowPolicies?.[name];
  if (!policy) return undefined;
  if (
    !policy.version ||
    [policy.column, policy.membership, policy.currentCompanies].filter(Boolean)
      .length > 1
  )
    throw new DataInputError("Invalid row restriction");
  const column = (table: string, property: string, tableAlias: string) => {
    if (
      !has(registry, table) ||
      !has(getTableColumns(registry[table]), property)
    )
      throw new DataInputError("Invalid row column");
    return sql`${sql.identifier(tableAlias)}.${sql.identifier(getTableColumns(registry[table])[property].name)}`;
  };
  if (policy.membership) {
    if (
      policy.version !== "shared-profiles-v1" ||
      policy.membership.column !== "sources_json"
    )
      throw new DataInputError("Unsupported membership policy");
    return memberOf(column(name, "sources_json", alias), policy.membership.workflowId);
  }
  if (policy.currentCompanies) {
    if (policy.version !== "shared-profiles-v1")
      throw new DataInputError("Unsupported company population");
    const people = policy.currentCompanies.peopleTable;
    const person = "population_person";
    return sql`${column(name, "key", alias)} IN (SELECT DISTINCT role->>'company_key' FROM ${registry[people] ?? sql``} ${sql.identifier(person)}, ${elements(column(people, "experiences_json", person))} role WHERE role->>'current_status' = 'current' AND ${memberOf(column(people, "sources_json", person), policy.currentCompanies.workflowId)})`;
  }
  if (!policy.column) return undefined;
  if (policy.equals === undefined)
    throw new DataInputError("Invalid row restriction");
  return sql`${column(name, policy.column, alias)} = ${policy.equals}`;
}

/** Count registered business tables, respecting the same authored row restrictions. */
export async function readCounts(
  config: WorkflowData,
  registry: Registry,
  client: Reader,
) {
  return Promise.all(
    config.tables.map(async (view) => {
      const table = registry[view.name];
      if (!table) throw new DataInputError("Unknown data table");
      const restriction = population(config, registry, view.name, "v");
      const result = await client.execute(sql`SELECT count(*)::int AS total FROM ${table} v${and(restriction ? [restriction] : [])}`);
      return {
        table: view.name,
        label: view.label,
        total: Number(result.rows[0].total),
      };
    }),
  );
}

/** All SQL identifiers come from the authored registry; URL values are bound parameters. */
export async function readData(
  config: WorkflowData,
  registry: Registry,
  client: Reader,
  url: URL,
  identity?: { columns: string[] },
): Promise<DataPage> {
  // The Drizzle table renders with its schema ("gtm"."people"), so nothing here relies on a search path.
  const physical = (name: string) => {
    if (!has(registry, name)) throw new DataInputError("Unknown data table");
    return sql`${registry[name]}`;
  };
  const column = (name: string, property: string) => {
    physical(name);
    const columns = getTableColumns(registry[name]);
    if (!has(columns, property))
      throw new DataInputError("Unknown data column");
    return sql.identifier(columns[property].name);
  };
  const view = (name: string) => {
    const found = config.tables.find((v) => v.name === name);
    if (!found)
      throw new DataInputError("Table is not available in this workflow");
    physical(name);
    if (!identity) column(name, "key");
    column(name, found.labelColumn);
    found.columns.forEach((c) => column(name, c));
    return found;
  };
  const rowPolicy = (name: string, alias: string) => {
    const restriction = population(config, registry, name, alias);
    return restriction ? [restriction] : [];
  };
  const selected = view(
    url.searchParams.get("table") ?? config.tables[0]?.name ?? "",
  );
  const keyColumns = identity?.columns ?? ["key"];
  keyColumns.forEach((c) => column(selected.name, c));
  const recordKey = (row: Record<string, unknown>) => identity
    ? JSON.stringify(keyColumns.map((c) => Buffer.isBuffer(row[c])
      ? { blob: (row[c] as Buffer).toString("hex") } : row[c]))
    : String(row.key);
  const pageText = url.searchParams.get("page") ?? "0";
  if (!/^\d{1,6}$/.test(pageText)) throw new DataInputError("Invalid page");
  const page = Number(pageText);
  const href = (params: Record<string, string>) => {
    const out = new URLSearchParams(params);
    const token = url.searchParams.get("t");
    if (token) out.set("t", token);
    return `${url.pathname}?${out}`;
  };
  const relations = (config.relations ?? []).filter(
    (r) => r.from === selected.name || r.to === selected.name,
  );
  const other = (r: Relation) => view(r.from === selected.name ? r.to : r.from);
  const nearColumn = (r: Relation) =>
    r.reference
      ? sql.identifier(r.from === selected.name ? "__from" : "__to")
      : column(r.through, r.from === selected.name ? r.fromColumn : r.toColumn);
  const farColumn = (r: Relation) =>
    r.reference
      ? sql.identifier(r.from === selected.name ? "__to" : "__from")
      : column(r.through, r.from === selected.name ? r.toColumn : r.fromColumn);
  const through = (r: Relation) => {
    if (!r.reference) return physical(r.through);
    if (
      r.reference !== "current-experiences-v1" ||
      r.through !== r.from ||
      r.fromColumn !== "key" ||
      r.toColumn !== "experiences_json"
    )
      throw new DataInputError("Unsupported structured relationship");
    return sql`(SELECT p.*, p.${column(r.through, "key")} AS "__from", role->>'company_key' AS "__to" FROM ${physical(r.through)} p, ${elements(sql`p.${column(r.through, "experiences_json")}`)} role WHERE role->>'current_status' = 'current')`;
  };
  relations.forEach((r) => {
    other(r);
    nearColumn(r);
    farColumn(r);
    through(r);
  });
  const conditions: SQL[] = [...rowPolicy(selected.name, "v")];
  const key = url.searchParams.get("key");
  if (key !== null) {
    let values: unknown = [key];
    if (identity) {
      try { values = JSON.parse(key); }
      catch { throw new DataInputError("Invalid record key"); }
    }
    if (identity && Array.isArray(values)) values = values.map((v) =>
      v && typeof v === "object" && typeof v.blob === "string" && /^(?:[a-f0-9]{2})*$/.test(v.blob)
        ? Buffer.from(v.blob, "hex") : v);
    if (!Array.isArray(values) || values.length !== keyColumns.length ||
      values.some((v) => v !== null && !Buffer.isBuffer(v) && !["string", "number", "boolean"].includes(typeof v)))
      throw new DataInputError("Invalid record key");
    keyColumns.forEach((c, i) => {
      // Null-safe equality: a table without a primary key is identified by all its columns, and some are null.
      conditions.push(sql`v.${column(selected.name, c)} IS NOT DISTINCT FROM ${(values as unknown[])[i]}`);
    });
  }
  const allowedColumn = (property: string) => {
    if (!selected.columns.includes(property))
      throw new DataInputError("Field is not available in this workflow");
    return sql`v.${column(selected.name, property)}`;
  };
  const search = url.searchParams.get("q") ?? "";
  if (search.length > 256) throw new DataInputError("Search is too long");
  const searchColumns =
    selected.searchableColumns ??
    selected.columns.filter((c) => !c.endsWith("_json"));
  if (search && searchColumns.length) {
    // ILIKE: search ignores case, as it always has. Backslash is the default escape character.
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(sql`(${sql.join(searchColumns.map((c) => sql`CAST(${allowedColumn(c)} AS TEXT) ILIKE ${pattern}`), sql` OR `)})`);
  }
  const filter = url.searchParams.get("field");
  if (filter) {
    const field = allowedColumn(filter);
    const op = url.searchParams.get("operator") ?? "eq";
    const operators: Record<string, SQL> = {
      eq: sql`=`,
      ne: sql`!=`,
      gt: sql`>`,
      lt: sql`<`,
    };
    if (op === "missing") conditions.push(sql`${field} IS NULL`);
    else if (Object.hasOwn(operators, op))
      // Postgres reads the value as the column's type; one that does not fit is reported below as invalid input.
      conditions.push(sql`${field} ${operators[op]} ${url.searchParams.get("value") ?? ""}`);
    else throw new DataInputError("Invalid filter operator");
  }
  const sort = url.searchParams.get("sort") ?? selected.labelColumn;
  const order = url.searchParams.get("order") ?? "asc";
  if (!["asc", "desc"].includes(order))
    throw new DataInputError("Invalid sort direction");
  const sortField = allowedColumn(sort);
  const relatedTable = url.searchParams.get("relatedTable");
  const relatedKey = url.searchParams.get("relatedKey");
  let context: string | undefined;
  if ((relatedTable === null) !== (relatedKey === null))
    throw new DataInputError("Incomplete relationship filter");
  if (relatedTable !== null) {
    const relation = relations.find((r) => other(r).name === relatedTable);
    if (!relation)
      throw new DataInputError(
        "Relationship is not available in this workflow",
      );
    conditions.push(
      sql`EXISTS (SELECT 1 FROM ${through(relation)} e${and([sql`e.${nearColumn(relation)} = v.${column(selected.name, "key")}`, sql`e.${farColumn(relation)} = ${relatedKey}`, ...rowPolicy(relation.through, "e")])})`,
    );
    const source = view(relatedTable);
    const sourceRestriction = rowPolicy(source.name, "v");
    const record = await client.execute(
      sql`SELECT v.${column(source.name, source.labelColumn)} AS label FROM ${physical(source.name)} v${and([sql`v.${column(source.name, "key")} = ${relatedKey}`, ...sourceRestriction])} LIMIT 1`,
    );
    if (sourceRestriction.length && !record.rows.length)
      throw new DataInputError("Related record is unavailable");
    context = `Connected to ${record.rows[0]?.label ?? relatedKey}`;
  }
  const requested = url.searchParams.get("columns")?.split(",");
  const visible =
    requested ??
    (key !== null
      ? selected.columns.filter((c) => identity || c !== "raw_responses_json")
      : (selected.defaultColumns ?? selected.columns));
  if (
    !visible.length ||
    new Set(visible).size !== visible.length ||
    visible.some((c) => !selected.columns.includes(c))
  )
    throw new DataInputError("Unavailable requested field");
  const props = [...new Set([...keyColumns, ...visible])];
  // Times leave SQL as ISO text in UTC, so no caller parses Postgres' own format. Key columns keep microseconds to match exactly.
  const readable = (c: string) => {
    const type = getTableColumns(registry[selected.name])[c].getSQLType();
    if (!type.startsWith("timestamp")) return sql`v.${column(selected.name, c)}`;
    const format = `YYYY-MM-DD"T"HH24:MI:SS.${keyColumns.includes(c) ? "US" : "MS"}`;
    return type.includes("with time zone")
      ? sql`to_char(v.${column(selected.name, c)} AT TIME ZONE 'UTC', ${`${format}"Z"`})`
      : sql`to_char(v.${column(selected.name, c)}, ${format})`;
  };
  const fields = sql.join(props.map((c) => sql`${readable(c)} AS ${sql.identifier(c)}`), sql`, `);
  const ordering = sql.join([sql`${sortField} ${order === "desc" ? sql`DESC` : sql`ASC`}`, ...keyColumns.map((c) => sql`v.${column(selected.name, c)}`)], sql`, `);
  let result, total;
  try {
    result = await client.execute(sql`SELECT ${fields} FROM ${physical(selected.name)} v${and(conditions)} ORDER BY ${ordering} LIMIT ${PAGE_SIZE + 1} OFFSET ${page * PAGE_SIZE}`);
    total = await client.execute(sql`SELECT count(*)::int AS total FROM ${physical(selected.name)} v${and(conditions)}`);
  } catch (error) {
    // Class 22 is "data exception": a filter or key value that is not of the column's type.
    const code = String((error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code ?? "");
    if (code.startsWith("22")) throw new DataInputError("Invalid filter value");
    throw error;
  }
  const records = result.rows.slice(0, PAGE_SIZE);
  const counts: Map<string, number>[] = [];
  for (const r of relations) {
    const count = new Map<string, number>();
    if (records.length) {
      // One parameter per key: a JavaScript array must never be interpolated into raw SQL.
      const keys = sql.join(records.map((row) => sql`${row.key}`), sql`, `);
      const joined = await client.execute(
        sql`SELECT e.${nearColumn(r)} AS owner, count(DISTINCT e.${farColumn(r)})::int AS total FROM ${through(r)} e JOIN ${physical(other(r).name)} target ON target.${column(other(r).name, "key")} = e.${farColumn(r)}${and([sql`e.${nearColumn(r)} IN (${keys})`, ...rowPolicy(r.through, "e"), ...rowPolicy(other(r).name, "target")])} GROUP BY e.${nearColumn(r)}`,
      );
      for (const row of joined.rows)
        count.set(String(row.owner), Number(row.total));
    }
    counts.push(count);
  }
  const pagination = (p: number) =>
    href({
      table: selected.name,
      page: String(p),
      ...(key !== null ? { key } : {}),
      ...(relatedTable !== null
        ? { relatedTable, relatedKey: relatedKey! }
        : {}),
    });
  return {
    total: Number(total.rows[0].total),
    keys: records.map(recordKey),
    fields: visible.map((id) => ({
      id,
      label:
        selected.fields?.[id]?.label ??
        id.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "),
      type:
        selected.fields?.[id]?.type ??
        getTableColumns(registry[selected.name])[id].dataType,
    })),
    availableFields: selected.columns.map((id) => ({
      id,
      label: selected.fields?.[id]?.label ?? id.replaceAll("_", " "),
      type:
        selected.fields?.[id]?.type ??
        getTableColumns(registry[selected.name])[id].dataType,
    })),
    title: selected.label,
    context,
    tabs: config.tables.map((v) => ({
      label: v.label,
      current: v.name === selected.name,
      href: href({ table: v.name }),
    })),
    columns: [
      ...visible.map((c) => c.replaceAll("_", " ")),
      ...relations.map((r) => other(r).label),
    ],
    rows: records.map((row) => [
      ...visible.map(
        (c): Cell => ({
          value: cellValue(row[c], c, selected.nested),
          ...(c === selected.labelColumn
            ? { href: href({ table: selected.name, key: recordKey(row) }) }
            : {}),
        }),
      ),
      ...relations.map(
        (r, i): Cell => ({
          value: `View ${counts[i].get(String(row.key)) ?? 0}`,
          href: href({
            table: other(r).name,
            relatedTable: selected.name,
            relatedKey: String(row.key),
          }),
        }),
      ),
    ]),
    ...(page > 0 ? { previous: pagination(page - 1) } : {}),
    ...(result.rows.length > PAGE_SIZE ? { next: pagination(page + 1) } : {}),
    all: href({ table: selected.name }),
  };
}

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function renderData(page: DataPage): string {
  const link = (href: string, label: string) =>
    `<a href="${esc(href)}">${esc(label)}</a>`;
  const rows = page.rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell.href ? link(cell.href, String(cell.value ?? "Unknown")) : esc(cell.value ?? "Unknown")}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)} · Workflow data</title><style>
body{margin:0;background:#fafaf9;color:#18181b;font:16px/1.5 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:24px 20px 64px}h1{font-size:28px;margin:12px 0}a{color:#0f766e;text-underline-offset:3px}a:focus-visible{outline:3px solid #0f766e;outline-offset:4px}nav{display:flex;gap:20px;flex-wrap:wrap;margin:16px 0}nav a[aria-current]{font-weight:700}.table{overflow:auto;border:1px solid #e4e4e7;border-radius:8px;background:white}table{border-collapse:collapse;width:100%;text-align:left}th,td{padding:12px 16px;border-bottom:1px solid #e4e4e7;vertical-align:top;min-width:120px;max-width:440px;overflow-wrap:anywhere}th{background:#f4f4f5;font-weight:600}.empty{padding:24px;color:#52525b}.count{font-variant-numeric:tabular-nums;color:#52525b}
</style></head><body><main><p class="count">Workflow data · read only</p><nav aria-label="Tables">${page.tabs.map((t) => `<a href="${esc(t.href)}"${t.current ? ' aria-current="page"' : ""}>${esc(t.label)}</a>`).join("")}</nav><h1>${esc(page.title)}</h1>${page.context ? `<p>${esc(page.context)}</p>` : ""}<p>${link(page.all, `Show all ${page.title.toLowerCase()}`)}</p><div class="table" role="region" aria-label="${esc(page.title)}" tabindex="0">${page.rows.length ? `<table><caption class="count">${page.rows.length} records on this page</caption><thead><tr>${page.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">No records found.</p>'}</div><nav aria-label="Pages">${page.previous ? link(page.previous, "Previous page") : ""}${page.next ? link(page.next, "Next page") : ""}</nav></main></body></html>`;
}

/** Data links are bearer capabilities, scoped separately from the shareable diagram. */
export const dataHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
