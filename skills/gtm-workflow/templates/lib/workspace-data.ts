import { sql, type SQL } from "drizzle-orm";
import { bigint, boolean, customType, doublePrecision, integer, jsonb, pgSchema, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { DataInputError, readData, type WorkflowData, type DataPage } from "./data-api";

type Reader = { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> };
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const JSON_TYPES = ["json", "jsonb"];

/** A Drizzle column for a Postgres type name, so readData can name, type and format it. Unknown types read as text. */
function columnFor(name: string, type: string) {
  if (["smallint", "integer"].includes(type)) return integer(name);
  if (type === "bigint") return bigint(name, { mode: "number" });
  if (["real", "double precision", "numeric"].includes(type)) return doublePrecision(name);
  if (type === "boolean") return boolean(name);
  if (JSON_TYPES.includes(type)) return jsonb(name);
  if (type === "timestamp with time zone") return timestamp(name, { withTimezone: true });
  if (type === "timestamp without time zone") return timestamp(name);
  if (type === "bytea") return bytea(name);
  return text(name);
}

/**
 * Inspect the connected database at read time, independently of workflow registration: workspace tables (schema
 * public) and runtime tables (schema gtm). The migration journals live in schema drizzle and are not listed.
 */
export async function readWorkspaceData(client: Reader, url: URL): Promise<DataPage | { unavailable: string }> {
  const catalog = await client.execute(
    sql`SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'gtm') AND table_type = 'BASE TABLE' ORDER BY lower(table_name), table_name, table_schema DESC`,
  );
  // Runtime names are reserved, so a plain name is unique; a hand-made public table of the same name keeps it.
  const taken = new Set(catalog.rows.filter((row) => row.table_schema === "public").map((row) => String(row.table_name)));
  const tables = catalog.rows.map((row) => ({
    schema: String(row.table_schema),
    table: String(row.table_name),
    name: row.table_schema === "gtm" && taken.has(String(row.table_name)) ? `gtm.${row.table_name}` : String(row.table_name),
  }));
  if (!tables.length) return { unavailable: "No data tables yet." };
  const name = url.searchParams.get("table") ?? tables[0].name;
  const found = tables.find((entry) => entry.name === name);
  if (!found) throw new DataInputError("Unknown data table");
  const columns = (await client.execute(
    sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ${found.schema} AND table_name = ${found.table} ORDER BY ordinal_position`,
  )).rows.map((row) => ({ name: String(row.column_name), type: String(row.data_type) }));
  const properties = Object.fromEntries(columns.map((column) => [column.name, columnFor(column.name, column.type)]));
  const primary = (await client.execute(
    sql`SELECT k.column_name FROM information_schema.table_constraints c JOIN information_schema.key_column_usage k ON k.constraint_schema = c.constraint_schema AND k.constraint_name = c.constraint_name AND k.table_schema = c.table_schema AND k.table_name = c.table_name WHERE c.constraint_type = 'PRIMARY KEY' AND c.table_schema = ${found.schema} AND c.table_name = ${found.table} ORDER BY k.ordinal_position`,
  )).rows.map((row) => String(row.column_name));
  const visible = columns.map((column) => column.name);
  // Identity is the primary key; without one it is every column, leaving out JSON, which a record key cannot carry.
  const comparable = columns.filter((column) => !JSON_TYPES.includes(column.type)).map((column) => column.name);
  const identity = primary.length ? primary : comparable.length ? comparable : visible;
  const label = ["name", "full_name", "title", ...primary, ...visible]
    .find((candidate) => visible.includes(candidate))!;
  const config: WorkflowData = {
    tables: [{ name, label: name, columns: visible, labelColumn: label,
      searchableColumns: visible }],
  };
  const table = found.schema === "gtm" ? pgSchema("gtm").table(found.table, properties) : pgTable(found.table, properties);
  const result = await readData(config, { [name]: table }, client, url, { columns: identity });
  return { ...result, tabs: tables.map((entry) => ({
    label: entry.name,
    current: entry.name === name,
    href: `${url.pathname}?${new URLSearchParams({ table: entry.name })}`,
  })) };
}
