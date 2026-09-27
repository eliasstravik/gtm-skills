#!/usr/bin/env node
// Shared setup. --local: scaffold `workflows/` from the template, add the root files, install, and prepare the local
// database (start this workspace's Postgres, migrate, stop). No account needed, nothing started.
// --deploy: the same, then go live (scripts/hosted.mjs): repository, Vercel project, Neon, share project, secrets,
// the first push and a production deployment. Every step is skipped when already done, so it is also the repair.
import { parseArgs } from "node:util";
import { resolve, join, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { writeRootFiles } from "./root-files.mjs";
import { teamSpendCap } from "./share-firewall.mjs";
import { requireThat, safeError, setupHosted, workflowProject } from "./hosted.mjs";
const skill = dirname(dirname(fileURLToPath(import.meta.url)));
const templates = join(skill, "templates");
/** vercel.json is template-owned except `crons`, which the workspace's schedules fill. */
export async function mergeVercelJson(runtime) {
  const file = join(runtime, "vercel.json"), template = JSON.parse(await readFile(join(templates, "vercel.json"), "utf8"));
  const current = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
  const merged = { ...current, ...template, crons: current.crons ?? template.crons };
  if (JSON.stringify(merged) === JSON.stringify(current)) return false;
  await writeFile(file, JSON.stringify(merged, null, 2) + "\n");
  return true;
}
export async function setupLocal(workspace) {
  await mkdir(workspace, { recursive: true });
  const runtime = join(workspace, "workflows");
  if (!existsSync(join(runtime, "package.json"))) {
    requireThat(!existsSync(runtime) || !(await readdir(runtime)).length, "workflow_directory_not_empty", 409,
      `${runtime} holds files but no package.json: move them aside, then run setup again.`);
    await cp(templates, runtime, { recursive: true, filter: (source) => {
      const path = relative(templates, source).replaceAll("\\", "/");
      return !/(?:^|\/)(?:node_modules|\.output|\.nitro|\.vercel|data|\.env(?:\.[^/]+)?)(?:\/|$)/.test(path) && !/public\/(?:viewer|connections)-assets/.test(path);
    } });
    await writeFile(join(runtime, "workflows/index.ts"), "export const workflows = {};\n");
    await rm(join(runtime, "env.example"), { force: true });
  }
  // A scaffold that died half-way is finished on the next run.
  if (existsSync(join(runtime, "gitignore"))) await rename(join(runtime, "gitignore"), join(runtime, ".gitignore"));
  await mergeVercelJson(runtime);
  // CI and the root ignore file sit outside workflows/; missing ones are added on every setup, existing ones are kept.
  await writeRootFiles(workspace);
  const run = (command, args) => {
    const windowsNpm = process.platform === "win32" && command === "npm";
    const result = spawnSync(windowsNpm ? "npm.cmd" : command, args, { cwd: runtime, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024, shell: windowsNpm });
    requireThat(result.status === 0, `local_setup_${args[0].split("/").pop().replace(/[^a-zA-Z0-9]/g, "_")}_failed`, 503, (result.stderr || result.stdout || "").trim().split("\n").slice(-3).join(" ").slice(0, 300) || undefined);
  };
  // Install when missing, or when the lockfile changed since the last install (npm ci writes node_modules/.package-lock.json).
  const installed = join(runtime, "node_modules", ".package-lock.json");
  if (!existsSync(installed) || statSync(join(runtime, "package-lock.json")).mtimeMs > statSync(installed).mtimeMs) run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  run(process.execPath, ["scripts/build-viewer.mjs"]);
  // Start this workspace's Postgres, migrate it and stop it again. A running `npm run dev` already owns and migrated it.
  const { ensureLocalDatabase } = await import(pathToFileURL(join(runtime, "scripts/local-database.mjs")));
  requireThat(typeof ensureLocalDatabase === "function", "upgrade_workflow_runtime", 409, "Upgrade workflows/ to the current template first.");
  const database = await ensureLocalDatabase(runtime).catch((error) => { if (/^Already running/.test(error?.message)) return null; throw error; });
  if (database) try {
    const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], { cwd: runtime, stdio: "pipe", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:DATABASE_URL|PG|POSTGRES_|VERCEL|GTM_DATABASE)/.test(name))) });
    requireThat(result.status === 0, "local_setup_migrate_failed", 503);
  } finally { await database.stop(); }
  if (!database) return { status: "local_ready", workspace, devServer: "running", next: "npm run dev is running for this workspace and has migrated its database; restart it to pick up this setup." };
  return { status: "local_ready", workspace, next: `cd ${JSON.stringify(runtime)} && npm run dev, then open http://127.0.0.1:3939/viewer (Keys: http://127.0.0.1:3939/connections)` };
}
async function main() {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, local: { type: "boolean" }, deploy: { type: "boolean" }, team: { type: "string" }, json: { type: "boolean" },
    upgrade: { type: "boolean" }, "workflow-project": { type: "string" }, "share-project": { type: "string" }, "agent-project": { type: "string" }, "github-owner": { type: "string" } } });
  requireThat(values.workspace && Boolean(values.local) !== Boolean(values.deploy), "choose_local_or_deploy", 400, "Pass --workspace <path> and one of --local or --deploy.");
  const workspace = resolve(values.workspace);
  let result = await setupLocal(workspace);
  if (values.deploy) {
    const target = workflowProject(workspace, { team: values.team, project: values["workflow-project"] });
    result = await setupHosted(workspace, { team: target.team, project: target.project, share: values["share-project"], agent: values["agent-project"], githubOwner: values["github-owner"] });
    result.spendCap = teamSpendCap({ team: target.team });
  }
  console.log(JSON.stringify(result)); process.exitCode = result.status === "needs_you" ? 2 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
