// Part of `npm run build`: a workspace whose queries would scan whole tables must not deploy. Turso bills every row
// scanned, so this runs every registered workflow query against a seeded database through the same guard the
// runtime uses, and checks that nothing holds a database client outside lib/db.ts. See references/cost.md.
import { createClient } from "@libsql/client";
import { build } from "esbuild";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const failures = [];
const HEAVY = ["raw_responses_json", "provenance_json"];
const MAY_CREATE_CLIENTS = ["lib/db.ts", "scripts/profile-migrate.mjs", "scripts/viewer-migrate.mjs", "scripts/check-queries.mjs"];

async function sources(dir) {
  const found = [];
  for (const entry of await readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sources(path)));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(entry.name)) found.push(path.split(sep).join("/"));
  }
  return found;
}
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

for (const dir of ["lib", "server", "workflows", "scripts", "db", "viewer-server", "share-server"])
  for (const file of await sources(dir)) {
    const text = withoutComments(await readFile(join(root, file), "utf8"));
    if (!MAY_CREATE_CLIENTS.includes(file) && (/import\s+(?!type\b)[^;]*from\s+["']@libsql\/client["']/.test(text) || /\bcreateClient\s*\(/.test(text)))
      failures.push(`${file}: creates its own database client. Every query goes through rawClient() or db() from lib/db.ts, which guard against table scans.`);
    if (dir === "workflows" && /\.(execute|batch|transaction|executeMultiple)\s*\(|\bdb\s*\(\s*\)/.test(text))
      failures.push(`${file}: runs SQL of its own. In a workflow file use the helpers in lib/profiles/population.ts and lib/rows.ts, or register the query with defineQuery from lib/query.ts so this check can run it.`);
  }

const dir = await mkdtemp(join(tmpdir(), "gtm-check-queries-"));
const url = `file:${join(dir, "check.db")}`;
process.env.GTM_CHECK_DATABASE = url;
process.env.GTM_GUARD_MODE = "enforce";
try {
  const outfile = join(root, "node_modules/.gtm-check/queries.mjs");
  await build({
    stdin: {
      contents: `import "./workflows/index";
export { definedQueries } from "./lib/query";
export { ledgerSchemaSql } from "./lib/profiles/ledger";
export { migrateProfileLookups } from "./lib/profiles/migrate";
export { resolveIdentity, applyEvidence } from "./lib/profiles/store";`,
      resolveDir: root,
      loader: "ts",
    },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "#viewer-registry": "./node_modules/.gtm-viewer/registry.json" },
    logLevel: "silent",
  });
  const { definedQueries, ledgerSchemaSql, migrateProfileLookups, resolveIdentity, applyEvidence } = await import(`file://${outfile}?${Date.now()}`);

  // The real schema: Drizzle migrations, then the operational and lookup tables, as the build applies them.
  const client = createClient({ url });
  const journal = JSON.parse(await readFile(join(root, "drizzle/meta/_journal.json"), "utf8").catch(() => '{"entries":[]}'));
  for (const entry of journal.entries)
    await client.executeMultiple((await readFile(join(root, "drizzle", `${entry.tag}.sql`), "utf8")).replaceAll("--> statement-breakpoint", ""));
  await client.executeMultiple(ledgerSchemaSql);
  const profiles = await client.execute("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('people','companies')");
  if (Number(profiles.rows[0].n) === 2) {
    await migrateProfileLookups(client);
    const at = new Date().toISOString();
    for (let i = 0; i < 12; i++) {
      const person = await resolveIdentity(client, "people", { linkedin_url: `https://www.linkedin.com/in/check-${i}` }, { workflow_id: "check", source_id: "seed", source_row_id: String(i), first_observed_at: at, last_observed_at: at });
      if (person.status === "resolved")
        await applyEvidence(client, "people", person.profile.key, {
          provider: "seed", endpoint: "profile", mode: "full", fetched_at: at, outcome: "success", raw: {}, cost_usd: 0,
          sections: { experiences_json: "complete" },
          fields: { full_name: `Check ${i}`, experiences_json: [{ experience_key: `e${i}`, company_key: null, company_name: `Check Co ${i % 4}`, title: "Role", start_date: null, end_date: null, current_status: "current", current_status_evidence: null, company_linkedin_url: `https://www.linkedin.com/company/check-${i % 4}`, company_domain: `check${i % 4}.example` }] },
        });
    }
  }
  client.close();

  const queries = definedQueries();
  for (const query of queries) {
    try {
      const result = await query.run();
      const heavy = result.columns.filter((c) => HEAVY.includes(c));
      if (heavy.length)
        failures.push(`${query.name}: returns ${heavy.join(", ")}. These hold whole provider responses; name the columns the step needs, and read one full profile with getProfile.`);
    } catch (error) {
      failures.push(`${query.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) {
    console.error(`Query check failed (${failures.length}):\n\n${failures.map((f) => `- ${f}`).join("\n\n")}\n`);
    process.exitCode = 1;
  } else console.log(`Query check passed: ${queries.length} workflow quer${queries.length === 1 ? "y" : "ies"} ran as index searches; one database client.`);
} catch (error) {
  console.error(`Query check could not run: ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
