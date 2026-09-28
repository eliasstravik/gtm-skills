#!/usr/bin/env node
// Doctor: only what the Vercel dashboard does not show at a glance, each problem with its fix. --target local (default):
// the runtime is installed and current, root files and vercel.json match the template, no retired settings linger in
// workflows/.env, and a Vercel link keeps production's database out of Development. --target production: the list in
// scripts/hosted.mjs doctorHosted. Exit 0 when ready, 2 when something needs doing, 1 when the check itself failed.
import { parseArgs } from "node:util";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { rootFileDrift } from "./root-files.mjs";
import { compareVersions } from "./upgrade-package.mjs";
import { teamSpendCap } from "./share-firewall.mjs";
import { DATABASE_VARIABLE, doctorHosted, requireThat, safeError, workflowProject } from "./hosted.mjs";

const templates = join(dirname(dirname(fileURLToPath(import.meta.url))), "templates");
// Settings of earlier designs: the run password, the old agent wiring and the old database. None is read any more.
const RETIRED = /^(?:GTM_RUN_SECRET|GTM_WORKFLOW_URL|GTM_AGENT_URL|GTM_NOTIFY_SECRET|GTM_DATA_URL|GTM_RUNS_URL)$/;

/** Pulled Development variables that point at production's database. Values stay in a private temporary file. */
async function productionInDevelopment(runtime) {
  const folder = await mkdtemp(join(tmpdir(), "gtm-doctor-")), file = join(folder, "development.env");
  try {
    const pull = spawnSync("vercel", ["env", "pull", file, "--environment=development", "--yes", "--non-interactive"], { cwd: runtime, stdio: "pipe" });
    if (pull.status !== 0) return { status: "unknown" };
    const urls = Object.entries(parseEnv(await readFile(file, "utf8"))).filter(([name, value]) => DATABASE_VARIABLE.test(name) && /^postgres(?:ql)?:\/\//.test(value));
    if (!urls.length) return { status: "none" };
    const { isProductionDatabase } = await import(pathToFileURL(join(runtime, "scripts/local-database.mjs")));
    const production = [];
    for (const [name, url] of urls) if (await isProductionDatabase(url).catch(() => true)) production.push(name);
    return production.length ? { status: "production", names: production } : { status: "development_branch" };
  } finally { await rm(folder, { recursive: true, force: true }); }
}

/** What an older workspace needs before the installed skills can run it, or null. Kinds: gtm-workspace references/updates.md. */
export function migrationFor(runtime, mine, theirs) {
  if (existsSync(join(runtime, "scripts", "gtm.ts"))) return { kind: "previous_runtime", from: mine, to: theirs };
  if (existsSync(join(runtime, "db", "tables", "cache.ts"))) return { kind: "earlier_database", from: mine, to: theirs };
  if (!mine || !theirs || mine === theirs) return null;
  return { kind: compareVersions(mine, theirs) < 0 ? "template" : "skills_behind", from: mine, to: theirs };
}

async function local(workspace, target) {
  const runtime = join(workspace, "workflows"), problems = [];
  const add = (ok, check, fix) => { if (!ok) problems.push({ check, fix }); };
  const setup = "run setup --local";
  add(existsSync(join(runtime, "package.json")), "workflows/ holds the runtime", setup);
  const installed = join(runtime, "node_modules", ".package-lock.json");
  add(existsSync(installed), "Dependencies are installed", setup);
  add(existsSync(join(runtime, ".gitignore")), "workflows/.gitignore exists", setup);
  const version = (path) => { try { return JSON.parse(readFileSync(path, "utf8")).version; } catch { return null; } };
  const [mine, theirs] = [version(join(runtime, "package.json")), version(join(templates, "package.json"))];
  const migration = migrationFor(runtime, mine, theirs);
  add(!migration, `Runtime version ${mine} matches the installed skill's ${theirs}`, migration?.kind === "skills_behind"
    ? "update the skills first (gtm-workspace references/updates.md)" : "migrate the workspace (gtm-workspace references/updates.md#migrate)");
  const vercelJson = (path) => { try { const { crons, ...rest } = JSON.parse(readFileSync(path, "utf8")); return JSON.stringify(rest); } catch { return null; } };
  add(vercelJson(join(runtime, "vercel.json")) === vercelJson(join(templates, "vercel.json")), "vercel.json matches the template (crons aside)", setup);
  for (const file of await rootFileDrift(workspace)) add(false, `${file.path} ${file.status === "missing" ? "exists" : "matches the template"}`, file.status === "missing" ? setup : `copy it from the skill's root/ folder, keeping steps you added`);
  const dotEnv = join(runtime, ".env"), retired = existsSync(dotEnv) ? Object.keys(parseEnv(readFileSync(dotEnv, "utf8"))).filter((name) => RETIRED.test(name)) : [];
  add(!retired.length, "workflows/.env holds no retired settings", `delete ${retired.join(", ")} from workflows/.env (npm run dev loads it)`);
  const developmentDatabase = target.linked ? await productionInDevelopment(runtime) : { status: "not_linked" };
  add(developmentDatabase.status !== "production", "Vercel's Development environment holds no production database", "in the Neon integration's settings for this project, untick Development");
  add(developmentDatabase.status !== "unknown", "Vercel CLI can read the linked project", "sign in with `vercel login`");
  // Copy-down: the saved Neon project and Postgres 18 client tools. Optional, so reported but not a problem.
  const major = Number(/\b(\d+)/.exec(spawnSync("pg_dump", ["--version"], { encoding: "utf8" }).stdout ?? "")?.[1]);
  const copyDown = !existsSync(join(runtime, "data", "neon.json")) ? { status: "unavailable", instruction: "Run setup --deploy with neonctl signed in." }
    : !(major >= 18) ? { status: "unavailable", instruction: "Install Postgres 18 client tools: `brew install libpq`, then add $(brew --prefix libpq)/bin to PATH." }
    : { status: "available" };
  return { status: problems.length ? "needs_fixing" : "local_ready", workspace, linked: Boolean(target.linked), problems, migration, copyDown };
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) try {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, target: { type: "string", default: "local" }, team: { type: "string" }, "workflow-project": { type: "string" }, json: { type: "boolean" } } });
  requireThat(values.workspace, "workspace_required", 400, "Pass --workspace <path to the workspace>.");
  const workspace = resolve(values.workspace);
  const target = workflowProject(workspace, { team: values.team, project: values["workflow-project"] });
  const result = values.target === "production" ? { ...(await doctorHosted({ ...target, workspace })), spendCap: teamSpendCap({ team: target.team }) } : await local(workspace, target);
  console.log(JSON.stringify(result));
  process.exitCode = result.problems.length ? 2 : 0;
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
