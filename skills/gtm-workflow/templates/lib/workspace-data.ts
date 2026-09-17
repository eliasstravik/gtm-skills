import type { Client } from "@libsql/client";
import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";
import { DataInputError, readData, type WorkflowData, type DataPage } from "./data-api";

/** Inspect the connected database at read time, independently of workflow registration. */
export async function readWorkspaceData(client: Pick<Client, "execute">, url: URL): Promise<DataPage | { unavailable: string }> {
  const catalog = await client.execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND substr(name, 1, 7) != 'sqlite_' ORDER BY name COLLATE NOCASE, name",
  );
  const names = catalog.rows.map((row) => String(row.name));
  if (!names.length) return { unavailable: "No data tables yet." };
  const name = url.searchParams.get("table") ?? names[0];
  if (!names.includes(name)) throw new DataInputError("Unknown data table");
  const schema = await client.execute({
    sql: "SELECT name, type, pk, hidden FROM pragma_table_xinfo(?) ORDER BY cid",
    args: [name],
  });
  // Generated columns are readable; virtual-table implementation columns are hidden.
  const columns = schema.rows.filter((row) => Number(row.hidden) !== 1);
  const properties = Object.fromEntries(columns.map((row) => {
    const type = String(row.type).toUpperCase();
    const name = String(row.name);
    const column = type.includes("INT") ? integer(name)
      : /REAL|FLOA|DOUB/.test(type) ? real(name)
      : type.includes("BLOB") ? blob(name, { mode: "buffer" }) : text(name);
    return [name, column];
  }));
  const primary = columns.filter((row) => Number(row.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk)).map((row) => String(row.name));
  const rowid = ["rowid", "_rowid_", "oid"].find((candidate) =>
    !columns.some((row) => String(row.name).toLowerCase() === candidate));
  const definition = await client.execute({
    sql: "SELECT wr FROM pragma_table_list WHERE schema = 'main' AND name = ?",
    args: [name],
  });
  let identity = primary;
  if (!Number(definition.rows[0]?.wr) && rowid) {
    // A rowid is unique even for tables with nullable or absent primary keys.
    let property = "__viewer_rowid";
    while (Object.hasOwn(properties, property)) property += "_";
    properties[property] = integer(rowid);
    identity = [property];
  }
  if (!identity.length) identity = columns.map((row) => String(row.name));
  const visible = columns.map((row) => String(row.name));
  const label = ["name", "full_name", "title", ...primary, ...visible]
    .find((candidate) => visible.includes(candidate))!;
  const config: WorkflowData = {
    tables: [{ name, label: name, columns: visible, labelColumn: label,
      searchableColumns: visible }],
  };
  const result = await readData(config, { [name]: sqliteTable(name, properties) }, client, url, { columns: identity });
  return { ...result, tabs: names.map((table) => ({
    label: table,
    current: table === name,
    href: `${url.pathname}?${new URLSearchParams({ table })}`,
  })) };
}
