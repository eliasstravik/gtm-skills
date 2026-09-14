import type { Client, InValue } from "@libsql/client";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

/** Explicit, workflow-scoped views. Column names are Drizzle property names. */
export type WorkflowData = {
  tables: { name: string; label: string; columns: string[]; labelColumn: string }[];
  relations?: { from: string; to: string; through: string; fromColumn: string; toColumn: string }[];
};
type Registry = Record<string, SQLiteTable>;
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
};

const PAGE_SIZE = 25;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const has = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

export class DataInputError extends Error {}

/** All SQL identifiers come from the authored registry; URL values are bound parameters. */
export async function readData(config: WorkflowData, registry: Registry, client: Pick<Client, "execute">, url: URL): Promise<DataPage> {
  const physical = (name: string) => {
    if (!has(registry, name)) throw new DataInputError("Unknown data table");
    return quote(getTableName(registry[name]));
  };
  const column = (name: string, property: string) => {
    physical(name);
    const columns = getTableColumns(registry[name]);
    if (!has(columns, property)) throw new DataInputError("Unknown data column");
    return quote(columns[property].name);
  };
  const view = (name: string) => {
    const found = config.tables.find((v) => v.name === name);
    if (!found) throw new DataInputError("Table is not available in this workflow");
    physical(name);
    column(name, "key");
    column(name, found.labelColumn);
    found.columns.forEach((c) => column(name, c));
    return found;
  };
  const selected = view(url.searchParams.get("table") ?? config.tables[0]?.name ?? "");
  const pageText = url.searchParams.get("page") ?? "0";
  if (!/^\d{1,6}$/.test(pageText)) throw new DataInputError("Invalid page");
  const page = Number(pageText);
  const href = (params: Record<string, string>) => {
    const out = new URLSearchParams(params);
    const token = url.searchParams.get("t");
    if (token) out.set("t", token);
    return `${url.pathname}?${out}`;
  };
  const relations = (config.relations ?? []).filter((r) => r.from === selected.name || r.to === selected.name);
  const other = (r: Relation) => view(r.from === selected.name ? r.to : r.from);
  const nearColumn = (r: Relation) => column(r.through, r.from === selected.name ? r.fromColumn : r.toColumn);
  const farColumn = (r: Relation) => column(r.through, r.from === selected.name ? r.toColumn : r.fromColumn);
  relations.forEach((r) => { other(r); nearColumn(r); farColumn(r); });
  const conditions: string[] = [];
  const args: InValue[] = [];
  const key = url.searchParams.get("key");
  if (key !== null) { conditions.push(`v.${column(selected.name, "key")} = ?`); args.push(key); }
  const relatedTable = url.searchParams.get("relatedTable");
  const relatedKey = url.searchParams.get("relatedKey");
  let context: string | undefined;
  if ((relatedTable === null) !== (relatedKey === null)) throw new DataInputError("Incomplete relationship filter");
  if (relatedTable !== null) {
    const relation = relations.find((r) => other(r).name === relatedTable);
    if (!relation) throw new DataInputError("Relationship is not available in this workflow");
    conditions.push(`EXISTS (SELECT 1 FROM ${physical(relation.through)} e WHERE e.${nearColumn(relation)} = v.${column(selected.name, "key")} AND e.${farColumn(relation)} = ?)`);
    args.push(relatedKey);
    const source = view(relatedTable);
    const record = await client.execute({ sql: `SELECT ${column(source.name, source.labelColumn)} AS label FROM ${physical(source.name)} WHERE ${column(source.name, "key")} = ? LIMIT 1`, args: [relatedKey] });
    context = `Connected to ${record.rows[0]?.label ?? relatedKey}`;
  }
  const props = [...new Set(["key", ...selected.columns])];
  const fields = props.map((c) => `v.${column(selected.name, c)} AS ${quote(c)}`).join(", ");
  const result = await client.execute({
    sql: `SELECT ${fields} FROM ${physical(selected.name)} v${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""} ORDER BY v.${column(selected.name, "key")} LIMIT ? OFFSET ?`,
    args: [...args, PAGE_SIZE + 1, page * PAGE_SIZE],
  });
  const records = result.rows.slice(0, PAGE_SIZE);
  const counts: Map<string, number>[] = [];
  for (const r of relations) {
    const count = new Map<string, number>();
    if (records.length) {
      const joined = await client.execute({
        sql: `SELECT e.${nearColumn(r)} AS owner, COUNT(DISTINCT e.${farColumn(r)}) AS total FROM ${physical(r.through)} e JOIN ${physical(other(r).name)} target ON target.${column(other(r).name, "key")} = e.${farColumn(r)} WHERE e.${nearColumn(r)} IN (${records.map(() => "?").join(",")}) GROUP BY e.${nearColumn(r)}`,
        args: records.map((row) => row.key as InValue),
      });
      for (const row of joined.rows) count.set(String(row.owner), Number(row.total));
    }
    counts.push(count);
  }
  const pagination = (p: number) => href({ table: selected.name, page: String(p), ...(key !== null ? { key } : {}), ...(relatedTable !== null ? { relatedTable, relatedKey: relatedKey! } : {}) });
  return {
    title: selected.label,
    context,
    tabs: config.tables.map((v) => ({ label: v.label, current: v.name === selected.name, href: href({ table: v.name }) })),
    columns: [...selected.columns.map((c) => c.replaceAll("_", " ")), ...relations.map((r) => other(r).label)],
    rows: records.map((row) => [
      ...selected.columns.map((c): Cell => ({ value: row[c], ...(c === selected.labelColumn ? { href: href({ table: selected.name, key: String(row.key) }) } : {}) })),
      ...relations.map((r, i): Cell => ({ value: `View ${counts[i].get(String(row.key)) ?? 0}`, href: href({ table: other(r).name, relatedTable: selected.name, relatedKey: String(row.key) }) })),
    ]),
    ...(page > 0 ? { previous: pagination(page - 1) } : {}),
    ...(result.rows.length > PAGE_SIZE ? { next: pagination(page + 1) } : {}),
    all: href({ table: selected.name }),
  };
}

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderData(page: DataPage): string {
  const link = (href: string, label: string) => `<a href="${esc(href)}">${esc(label)}</a>`;
  const rows = page.rows.map((row) => `<tr>${row.map((cell) => `<td>${cell.href ? link(cell.href, String(cell.value ?? "Unknown")) : esc(cell.value ?? "Unknown")}</td>`).join("")}</tr>`).join("");
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
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
