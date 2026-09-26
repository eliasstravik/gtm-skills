#!/usr/bin/env node
// The Slack agent's merge-only import access to one workspace's production database (see gtm-workflow's
// references/imports.md). Run once per workspace, by the owner, on a computer with neonctl and vercel signed in:
//
//   node import-access.mjs --workspace <path> --team <vercel team> --agent-project <gtm-agent-…>
//
// As the database owner it creates (or re-keys) the role gtm_agent_import with plain SQL: a role made through
// neonctl, the Console or the Neon API joins neon_superuser, which can delete everywhere. The role may SELECT,
// INSERT and UPDATE the workflow tables in public (now and, through default privileges, those later migrations add)
// and gtm.companies and gtm.people; nothing else, and never DELETE, TRUNCATE or DDL. A check through Neon's HTTP SQL
// endpoint proves it, then the role's connection string is stored as the agent project's sensitive
// GTM_NEON_IMPORT_URL, which the agent's host adds as the Neon-Connection-String header. Nothing secret is printed.
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const ROLE = "gtm_agent_import";
const GTM_TABLES = ["gtm.companies", "gtm.people"];
const { values } = parseArgs({ options: { workspace: { type: "string" }, team: { type: "string" }, "agent-project": { type: "string" } } });
if (!values.workspace || !values.team || !values["agent-project"]) throw Error("--workspace, --team and --agent-project are required");
const runtime = join(resolve(values.workspace), "workflows");
const pg = createRequire(join(runtime, "package.json"))("pg");
const neon = JSON.parse(readFileSync(join(runtime, "data", "neon.json"), "utf8"));
const cli = (command, args, input) => spawnSync(command, args, { input, encoding: "utf8", stdio: "pipe" });

const ownerResult = cli("neonctl", ["connection-string", "--project-id", neon.projectId, "--org-id", neon.orgId]);
if (ownerResult.status !== 0) throw Error("neonctl could not give the owner connection: sign in with `neonctl auth`");
const ownerUrl = new URL(ownerResult.stdout.trim());
if (ownerUrl.hostname.split(".")[0].replace(/-pooler$/, "") !== neon.endpoint) throw Error("neonctl answered for another endpoint than the saved one");
const owner = new pg.Client({ connectionString: ownerUrl.href });
owner.on("error", () => {});
await owner.connect();
const password = randomBytes(32).toString("hex");
let roleUrl;
try {
  const { rows: [who] } = await owner.query("SELECT current_user AS owner, current_database() AS database");
  const ident = (name) => owner.escapeIdentifier(name), literal = (text) => owner.escapeLiteral(text);
  const exists = (await owner.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROLE])).rowCount;
  await owner.query(`${exists ? "ALTER" : "CREATE"} ROLE ${ROLE} LOGIN PASSWORD ${literal(password)}`);
  // Direct or through another role.
  const superuser = (await owner.query("SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser' AND pg_has_role($1, oid, 'MEMBER')", [ROLE])).rowCount;
  if (superuser) throw Error(`${ROLE} is a member of neon_superuser; drop it in the Neon console and run this again`);
  await owner.query(`
    GRANT CONNECT ON DATABASE ${ident(who.database)} TO ${ROLE};
    GRANT USAGE ON SCHEMA public, gtm TO ${ROLE};
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLE};
    REVOKE ALL ON ALL TABLES IN SCHEMA gtm FROM ${ROLE};
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${ROLE};
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${ROLE};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(who.owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO ${ROLE};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(who.owner)} IN SCHEMA public GRANT USAGE ON SEQUENCES TO ${ROLE};
    GRANT SELECT, INSERT, UPDATE ON ${GTM_TABLES.join(", ")} TO ${ROLE};`);
  const url = new URL(ownerUrl.href);
  url.username = ROLE; url.password = password;
  roleUrl = url.href;

  // The check, through the same HTTP endpoint the agent uses, on a table made after the grants (a later migration).
  const sqlUrl = `https://${ownerUrl.hostname}/sql`;
  const http = async (query, params = []) => {
    const response = await fetch(sqlUrl, { method: "POST", headers: { "content-type": "application/json", "Neon-Connection-String": roleUrl }, body: JSON.stringify({ query, params }) });
    return { ok: response.ok, text: (await response.text()).slice(0, 300) };
  };
  const table = `public.gtm_import_check_${randomBytes(4).toString("hex")}`;
  await owner.query(`CREATE TABLE ${table} (key text PRIMARY KEY, n integer)`);
  const results = {};
  try {
    results.insert = (await http(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(null::${table}, $1) ON CONFLICT (key) DO UPDATE SET n = excluded.n`, [JSON.stringify([{ key: "a", n: 1 }])])).ok;
    results.update = (await http(`INSERT INTO ${table} SELECT * FROM json_populate_recordset(null::${table}, $1) ON CONFLICT (key) DO UPDATE SET n = excluded.n`, [JSON.stringify([{ key: "a", n: 2 }])])).ok
      && (await owner.query(`SELECT n FROM ${table} WHERE key = 'a'`)).rows[0]?.n === 2;
    const refused = async (query) => { const reply = await http(query); return !reply.ok && /permission denied/i.test(reply.text); };
    results.deleteRefused = await refused(`DELETE FROM ${table}`);
    results.truncateRefused = await refused(`TRUNCATE ${table}`);
    results.gtmDeleteRefused = await refused("DELETE FROM gtm.people WHERE false");
    results.runStateRefused = await refused("SELECT 1 FROM gtm.profile_runs LIMIT 1");
    results.grantsRefused = await refused("SELECT 1 FROM gtm.gtm_viewer_grants LIMIT 1");
    results.ddlRefused = await refused("CREATE TABLE public.gtm_import_should_fail (x int)");
  } finally { await owner.query(`DROP TABLE IF EXISTS ${table}`); }
  console.log(JSON.stringify({ role: ROLE, endpoint: neon.endpoint, check: results }));
  if (Object.values(results).some((value) => value !== true)) throw Error("The import role check failed; nothing was stored on the agent project");
} finally { await owner.end(); }

// Stored only after the check passed. Sensitive, Production only; a replaced value keeps the old one if the update fails.
const agent = ["--project", values["agent-project"], "--scope", values.team, "--non-interactive"];
const listed = cli("vercel", ["env", "ls", "production", "--format", "json", ...agent]);
if (listed.status !== 0) throw Error("vercel env ls failed: sign in with `vercel login`");
const present = JSON.parse(listed.stdout.split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n")).envs.some((row) => row.key === "GTM_NEON_IMPORT_URL");
const saved = cli("vercel", ["env", present ? "update" : "add", "GTM_NEON_IMPORT_URL", "production", "--sensitive", "--yes", ...agent], roleUrl);
roleUrl = undefined;
if (saved.status !== 0) throw Error("Storing GTM_NEON_IMPORT_URL on the agent project failed; run this again");
console.log(JSON.stringify({ stored: "GTM_NEON_IMPORT_URL", agentProject: values["agent-project"], next: "Redeploy the agent so its host adds the header." }));
