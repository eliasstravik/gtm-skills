// gtm-lib v22
import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { generateSQLiteDrizzleJson } from "drizzle-kit/api";
import { redact } from "../lib/redact.ts";

type Named = Record<string, unknown>;
function difference(before: Named, after: Named) {
  return {
    added: Object.keys(after).filter((key) => !(key in before)).sort(),
    removed: Object.keys(before).filter((key) => !(key in after)).sort(),
  };
}

async function main() {
  const [candidate, ...args] = process.argv.slice(2);
  const root = process.cwd();
  const config = (await import(pathToFileURL(join(root, "drizzle.config.ts")).href)).default;
  if (!["sqlite", "turso"].includes(config.dialect) || JSON.stringify(config.schema) !== JSON.stringify(["./lib/schema.ts", "./db/tables/*.ts"])) {
    return { ok: false, error: { code: "migration_config_unsupported", message: "Restore the managed schema configuration before generating migrations." } };
  }
  if (!args.includes("--custom")) {
    const modules = [join(root, "lib/schema.ts"), ...(await readdir(join(root, "db/tables"))).filter((name) => name.endsWith(".ts")).sort().map((name) => join(root, "db/tables", name))];
    const exports: Named = {};
    // Unique export keys avoid hiding a table when two files reuse an export name.
    for (const [i, file] of modules.entries()) {
      for (const [key, value] of Object.entries(await import(pathToFileURL(file).href))) exports[`${i}_${key}`] = value;
    }
    const current = await generateSQLiteDrizzleJson(exports) as {
      tables: Record<string, { columns: Named }>;
      views?: Named;
    };
    const snapshots = (await readdir(join(candidate, "meta"))).filter((name) => /^\d+_snapshot\.json$/.test(name)).sort();
    const previous = snapshots.length ? JSON.parse(await readFile(join(candidate, "meta", snapshots.at(-1)!), "utf8")) : { tables: {}, views: {} };
    const missingFixedTables = ["enrichment_cache", "enrichment_runs", "workflow_runs"].filter((name) => !(name in previous.tables));
    if (snapshots.length && missingFixedTables.length) return {
      ok: false, error: {
        code: "migration_snapshot_drift", missingFixedTables,
        message: "The latest snapshot omits shared runtime tables. No artifacts were changed. Compare the previous complete snapshot, committed SQL, declarations, and live schema before repairing snapshot metadata. Do not generate CREATE statements for tables that already exist.",
      },
    };
    const decisions: { kind: string; table?: string; added: string[]; removed: string[] }[] = [];
    for (const kind of ["tables", "views"] as const) {
      const delta = difference(previous[kind] ?? {}, current[kind] ?? {});
      if (delta.added.length && delta.removed.length) decisions.push({ kind, ...delta });
    }
    for (const [table, definition] of Object.entries(current.tables)) {
      if (!previous.tables[table]) continue;
      const delta = difference(previous.tables[table].columns, definition.columns);
      if (delta.added.length && delta.removed.length) decisions.push({ kind: "columns", table, ...delta });
    }
    if (decisions.length) return {
      ok: false,
      error: {
        code: "migration_input_required", decisions,
        message: "Added and removed schema objects may be renames. No artifacts were changed. Inspect the intended changes and snapshot history. For independent additions/removals or renames, use expand/contract: generate additions while retaining old objects, then generate the separately reviewed removal. Ask the user when data retention or intent is unresolved; do not guess terminal answers.",
      },
    };
  }
  const require = createRequire(import.meta.url);
  const binary = join(dirname(require.resolve("drizzle-kit")), "bin.cjs");
  const stagedConfig = join(dirname(candidate), "drizzle.config.ts");
  await writeFile(stagedConfig, `import config from ${JSON.stringify(join(root, "drizzle.config.ts"))};\nexport default { ...config, out: ${JSON.stringify(relative(root, candidate))} };\n`);
  const result = spawnSync(process.execPath, [binary, "generate", "--config", stagedConfig, ...args], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1_000_000,
  });
  const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/interactive prompts require|created or renamed|create or rename/i.test(diagnostic)) return { ok: false, error: { code: "migration_input_required", message: "The generator requested an interactive decision. No artifacts were changed. Inspect schema changes and resolve them using expand/contract before retrying." } };
  // Drizzle can print an error and exit zero. Require its affirmative receipt.
  if (result.error || result.status !== 0 || !/No schema changes|Your SQL migration file/i.test(diagnostic)) return { ok: false, error: { code: "migration_failed", message: "Generator did not confirm success. No artifacts were installed.", diagnostic: redact(diagnostic) } };
  return { ok: true };
}

try {
  const report = await main();
  console.log(JSON.stringify(report));
  process.exitCode = report.ok ? 0 : 1;
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: { code: "migration_failed", message: redact(error) } }));
  process.exitCode = 1;
}
