#!/usr/bin/env node
// Copies a workspace's data from its previous SQLite/Turso database into Postgres, and proves the copy.
//
// The source is always a local SQLite file. Dump each Turso database exactly once; that is the one billed read:
//   turso db shell <db> .dump > dump.sql && sqlite3 export.db < dump.sql
// Everything after runs against the file and may be repeated freely.
//
//   node import-from-turso.mjs export.db --diff-only --target-local <workflows folder>
//   IMPORT_TARGET_URL=… node import-from-turso.mjs export.db --confirm-host <host of that URL>
//
// The target must already be migrated by scripts/migrate.mjs and its gtm and public tables must be empty. The whole
// copy is one transaction and is committed only when the verification finds no difference, so a failure leaves the
// target exactly as it was: there is no resume mode and no emptying step.
import { DatabaseSync } from "node:sqlite";
import { statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { identifiersOf } from "../templates/lib/profiles/identifiers.mjs";

const skill = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BYTES = 0.4 * 1024 ** 3; // the Free plan holds 0.5 GB
const BATCH = 500;
// Never copied from the source, whatever it holds: PR #119 left a stale table of this name in production, and the
// reverted code writes only identifiers_json, so the JSON is the truth.
const DERIVED = ["profile_identifiers"];
const CONSUMED = { people: ["identifiers_json"], companies: ["identifiers_json"] };
const ENTITIES = ["people", "companies"];
const SCRATCH_MARKER = "gtm_scratch_marker";
const quote = (name) => `"${String(name).replaceAll('"', '""')}"`;

export class ImportError extends Error {}

function postgres(workflowsDir) {
  for (const base of [join(skill, "templates"), workflowsDir].filter(Boolean))
    try { return createRequire(join(base, "package.json"))("pg"); } catch { /* try the next */ }
  throw new ImportError("The pg package was not found: install the template's dependencies (npm ci in templates/) or give --target-local");
}

/** Tables and columns of the source file, as SQLite describes them. */
function readSource(db) {
  const tables = {};
  for (const { name } of db.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all()) {
    const columns = db.prepare("SELECT name, pk FROM pragma_table_xinfo(?) WHERE hidden = 0 ORDER BY cid").all(name);
    const key = columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    tables[name] = { columns: columns.map((column) => column.name), key: key.length ? key : columns.map((column) => column.name), count: db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get().n };
  }
  return tables;
}

/** Tables, columns and types of the target's gtm and public schemas. A name is expected in one of them only. */
async function readTarget(client) {
  const tables = {};
  const { rows } = await client.query("SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema IN ('gtm', 'public') ORDER BY table_schema, table_name, ordinal_position");
  for (const row of rows) {
    if (row.table_name === SCRATCH_MARKER) continue;
    const table = (tables[row.table_name] ??= { schema: row.table_schema, columns: {} });
    if (table.schema !== row.table_schema) throw new ImportError(`Table ${row.table_name} exists in both gtm and public; rename the workspace table`);
    table.columns[row.column_name] = { type: row.data_type, required: row.is_nullable === "NO" && row.column_default === null };
  }
  return tables;
}

/**
 * node:sqlite hands back text cut off at an embedded NUL, silently. So find such cells in SQL, and read those few
 * through a BLOB cast. Returns a reader that gives the true text of any cell.
 */
function cellReader(db, tables) {
  const cut = new Map();
  for (const [name, table] of Object.entries(tables))
    for (const column of table.columns)
      for (const row of db.prepare(`SELECT ${table.key.map(quote).join(", ")} FROM ${quote(name)} WHERE typeof(${quote(column)}) = 'text' AND instr(CAST(${quote(column)} AS BLOB), x'00') > 0`).all())
        cut.set(JSON.stringify([name, table.key.map((k) => row[k]), column]), true);
  return (name, row, column) => {
    const table = tables[name];
    if (!cut.has(JSON.stringify([name, table.key.map((k) => row[k]), column]))) return row[column];
    const found = db.prepare(`SELECT CAST(${quote(column)} AS BLOB) AS bytes FROM ${quote(name)} WHERE ${table.key.map((k) => `${quote(k)} IS ?`).join(" AND ")}`).get(...table.key.map((k) => row[k]));
    return new TextDecoder().decode(found.bytes);
  };
}

/** One stored value, shaped for the target column's type. Throws with a reason when it cannot be. */
function transform(value, type, stripNul) {
  if (value === null || value === undefined) return null;
  // Postgres rejects a raw NUL in any text, and its JSON escape (an odd run of backslashes before u0000) inside jsonb.
  const json = type === "jsonb" || type === "json";
  if (typeof value === "string" && (value.includes("\u0000") || (json && /(?<!\\)(?:\\\\)*\\u0000/.test(value)))) {
    if (!stripNul) throw new Error("holds a NUL character, which Postgres rejects (rerun with --strip-nul to remove it)");
    value = value.replaceAll("\u0000", "");
    if (json) value = value.replace(/(?<!\\)((?:\\\\)*)\\u0000/g, "$1");
  }
  if (type === "jsonb" || type === "json") {
    try { return JSON.stringify(JSON.parse(String(value))); } catch { throw new Error("is not valid JSON"); }
  }
  if (type.startsWith("timestamp")) {
    // ISO text, or epoch milliseconds where the old schema kept an integer.
    const date = typeof value === "number" || /^\d{11,}$/.test(String(value)) ? new Date(Number(value)) : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new Error("is not a time");
    return date.toISOString();
  }
  if (type === "boolean") {
    if ([0, 1, "0", "1", "true", "false"].includes(value)) return value === 1 || value === "1" || value === "true";
    throw new Error("is not 0 or 1");
  }
  if (["integer", "smallint", "bigint", "double precision", "real", "numeric"].includes(type)) {
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "number" || /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(String(value))) return Number(value);
    throw new Error("is not a number");
  }
  return value instanceof Uint8Array ? Buffer.from(value) : typeof value === "string" ? value : String(value);
}

/** What a value is compared as. `written` is what transform produced (JSON as text); a read-back value arrives parsed. */
function comparable(value, type, written = false) {
  if (value === null || value === undefined) return null;
  if (type === "jsonb" || type === "json") return written ? JSON.parse(value) : value;
  if (type.startsWith("timestamp")) return new Date(value).getTime();
  if (["integer", "smallint", "bigint", "double precision", "real", "numeric"].includes(type)) return Number(value);
  return Buffer.isBuffer(value) ? value.toString("hex") : value;
}

export async function runImport({ source, targetUrl, diffOnly = false, stripNul = false, reportPath, workflowsDir, log = console.log }) {
  const size = statSync(source).size;
  if (size > MAX_BYTES) throw new ImportError(`${source} is ${(size / 1024 ** 3).toFixed(2)} GB, over 0.4 GB: stop and ask the owner before creating a database for it`);
  const db = new DatabaseSync(source, { readOnly: true });
  const pg = postgres(workflowsDir);
  const client = new pg.Client({ connectionString: targetUrl, connectionTimeoutMillis: 10000 });
  client.on("error", () => {});
  await client.connect();
  const report = { source: { file: source, bytes: size }, target: { host: new URL(targetUrl).host }, tables: {}, skipped_tables: [], skipped_columns: [], consumed_columns: [], target_only_tables: [], problems: [], skipped_cache_rows: 0, identifier_conflicts: [], passed: false };
  try {
    const from = readSource(db), to = await readTarget(client), cell = cellReader(db, from);
    // First pass, before any write: the diff of the real source against the real target, and every value checked.
    const plan = [];
    for (const [name, table] of Object.entries(from)) {
      if (DERIVED.includes(name)) { report.skipped_tables.push({ table: name, rows: table.count, why: "derived in the target; never copied from the source" }); continue; }
      if (!to[name]) { report.skipped_tables.push({ table: name, rows: table.count, why: "not in the target" }); continue; }
      const columns = [];
      for (const column of table.columns) {
        if (to[name].columns[column]) columns.push(column);
        else if (CONSUMED[name]?.includes(column)) report.consumed_columns.push({ table: name, column, why: "consumed by identifier derivation" });
        else if (to[name].schema === "gtm") report.skipped_columns.push({ table: name, column, why: "not in the runtime's table" });
        else report.problems.push(`Workspace table ${name} has a column ${column} that the target does not: add it to db/tables, generate a migration and migrate first`);
      }
      for (const [column, info] of Object.entries(to[name].columns))
        if (info.required && !table.columns.includes(column)) report.problems.push(`Target column ${name}.${column} is required and the source has none`);
      plan.push({ name, schema: to[name].schema, columns, key: table.key, types: to[name].columns });
    }
    report.target_only_tables = Object.keys(to).filter((name) => !from[name] || DERIVED.includes(name)).sort();
    for (const table of plan) {
      report.tables[table.name] = { source_count: from[table.name].count };
      for (const row of db.prepare(`SELECT * FROM ${quote(table.name)}`).iterate())
        for (const column of [...table.columns, ...(CONSUMED[table.name] ?? []).filter((name) => name in row)]) {
          try { transform(cell(table.name, row, column), table.types[column]?.type ?? "jsonb", stripNul); }
          catch (error) { report.problems.push(`${table.name} ${JSON.stringify(table.key.map((k) => row[k]))}: ${column} ${error.message}`); }
        }
    }
    log(JSON.stringify({ source: report.source, target: report.target, rows: Object.fromEntries(Object.entries(from).map(([name, table]) => [name, table.count])), skipped_tables: report.skipped_tables, skipped_columns: report.skipped_columns, consumed_columns: report.consumed_columns, target_only_tables: report.target_only_tables, problems: report.problems }, null, 2));
    if (diffOnly) return report;
    if (report.problems.length) throw new ImportError(`Nothing was written. Fix these first:\n${report.problems.join("\n")}`);

    await client.query("BEGIN");
    for (const [name, table] of Object.entries(to)) {
      const { rows } = await client.query(`SELECT 1 FROM ${quote(table.schema)}.${quote(name)} LIMIT 1`);
      if (rows.length) throw new ImportError(`Target table ${table.schema}.${name} already holds rows: the import needs an empty, migrated target`);
    }
    const insert = async (schema, name, columns, rows) => {
      if (!rows.length) return;
      const values = rows.map((row, r) => `(${columns.map((_, c) => `$${r * columns.length + c + 1}`).join(",")})`).join(",");
      await client.query(`INSERT INTO ${quote(schema)}.${quote(name)} (${columns.map(quote).join(",")}) VALUES ${values}`, rows.flat());
    };
    const now = Date.now(), owners = new Map(), expected = {};
    for (const table of plan) {
      const order = table.key.map(quote).join(", ");
      let batch = [], claims = [];
      expected[table.name] = new Map();
      for (const row of db.prepare(`SELECT * FROM ${quote(table.name)} ORDER BY ${order}`).iterate()) {
        if (table.name === "cache" && new Date(String(row.expires_at)).getTime() < now) { report.skipped_cache_rows++; continue; }
        const values = table.columns.map((column) => transform(cell(table.name, row, column), table.types[column].type, stripNul));
        expected[table.name].set(JSON.stringify(table.key.map((k) => row[k])), values);
        batch.push(values);
        if (ENTITIES.includes(table.name)) {
          // The same function the store uses, so import and store cannot disagree. First record in key order owns a shared identifier.
          const record = { ...row, identifiers_json: row.identifiers_json ? JSON.parse(transform(cell(table.name, row, "identifiers_json"), "jsonb", stripNul)) : [] };
          for (const id of identifiersOf(table.name, record)) {
            const claim = JSON.stringify([table.name, id.namespace, id.value]), owner = owners.get(claim);
            if (owner === undefined) { owners.set(claim, row.key); claims.push([table.name, id.namespace, id.value, row.key, id.observed_at && !Number.isNaN(Date.parse(id.observed_at)) ? new Date(id.observed_at).toISOString() : null]); }
            else if (owner !== row.key) report.identifier_conflicts.push({ entity: table.name, namespace: id.namespace, value: id.value, owner, also_claimed_by: row.key });
          }
        }
        if (batch.length === BATCH) { await insert(table.schema, table.name, table.columns, batch); batch = []; }
        if (claims.length >= BATCH) { await insert("gtm", "profile_identifiers", ["entity", "namespace", "value", "key", "observed_at"], claims); claims = []; }
      }
      await insert(table.schema, table.name, table.columns, batch);
      await insert("gtm", "profile_identifiers", ["entity", "namespace", "value", "key", "observed_at"], claims);
    }

    // Verify inside the same transaction: every key and every value, no sampling. The tables are small.
    let differences = 0;
    for (const table of plan) {
      const result = report.tables[table.name], wanted = expected[table.name], seen = new Set();
      Object.assign(result, { target_count: 0, missing_in_target: [], missing_in_source: [], different: [] });
      const { rows } = await client.query(`SELECT ${[...new Set([...table.key, ...table.columns])].map(quote).join(",")} FROM ${quote(table.schema)}.${quote(table.name)}`);
      result.target_count = rows.length;
      // Keys are compared through the stored text form, so a key read back has to be put in that form first.
      const sourceForm = new Map([...wanted.keys()].map((key) => [JSON.stringify(JSON.parse(key).map((part, i) => comparable(transform(part, table.types[table.key[i]]?.type ?? "text", stripNul), table.types[table.key[i]]?.type ?? "text", true))), key]));
      for (const row of rows) {
        const key = sourceForm.get(JSON.stringify(table.key.map((k) => comparable(row[k], table.types[k]?.type ?? "text"))));
        if (!key) { result.missing_in_source.push(table.key.map((k) => row[k])); continue; }
        seen.add(key);
        const values = wanted.get(key), wrong = table.columns.filter((column, i) => !isDeepStrictEqual(comparable(row[column], table.types[column].type), comparable(values[i], table.types[column].type, true)));
        if (wrong.length) result.different.push({ key: JSON.parse(key), columns: wrong });
      }
      result.missing_in_target = [...wanted.keys()].filter((key) => !seen.has(key)).map((key) => JSON.parse(key));
      differences += result.missing_in_target.length + result.missing_in_source.length + result.different.length;
    }
    const identifiers = (await client.query("SELECT count(*)::int AS n FROM gtm.profile_identifiers")).rows[0].n;
    report.tables.profile_identifiers = { derived: true, target_count: identifiers, expected_count: owners.size };
    if (identifiers !== owners.size) differences++;
    report.passed = differences === 0;
    await client.query(report.passed ? "COMMIT" : "ROLLBACK");
    if (!report.passed) throw new ImportError("The copy did not verify and was rolled back; the target is as it was. See the report.");
    return report;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    report.error = error.message;
    throw error;
  } finally {
    if (reportPath && !diffOnly) writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    await client.end().catch(() => {});
    db.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { "diff-only": { type: "boolean" }, "strip-nul": { type: "boolean" }, "target-local": { type: "string" }, "confirm-host": { type: "string" }, report: { type: "string" } } });
    if (positionals.length !== 1) throw new ImportError("Usage: node import-from-turso.mjs <export.db> [--diff-only] [--strip-nul] (--target-local <workflows folder> | --confirm-host <host>, with IMPORT_TARGET_URL set)");
    let targetUrl, workflowsDir;
    if (values["target-local"]) {
      workflowsDir = resolve(values["target-local"]);
      targetUrl = await (await import(pathToFileURL(join(workflowsDir, "scripts/local-database.mjs")))).localDatabaseUrl(workflowsDir);
    } else {
      // Never DATABASE_URL: the target is named on purpose and its host is typed by the operator.
      targetUrl = process.env.IMPORT_TARGET_URL;
      if (!targetUrl) throw new ImportError("Set IMPORT_TARGET_URL, or give --target-local <workflows folder>");
      if (new URL(targetUrl).host !== values["confirm-host"]) throw new ImportError("--confirm-host must equal the host of IMPORT_TARGET_URL");
    }
    console.log(`Target host: ${new URL(targetUrl).host}`);
    const report = await runImport({ source: resolve(positionals[0]), targetUrl, diffOnly: values["diff-only"], stripNul: values["strip-nul"], reportPath: resolve(values.report ?? "import-report.json"), workflowsDir });
    if (!values["diff-only"]) console.log(`Imported and verified. ${report.identifier_conflicts.length} identifier conflict(s) to read in ${resolve(values.report ?? "import-report.json")}.`);
  } catch (error) {
    console.error(error instanceof ImportError ? error.message : error);
    process.exitCode = 1;
  }
}
