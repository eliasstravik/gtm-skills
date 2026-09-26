#!/usr/bin/env node
// Shared setup. --local: scaffold `workflows/` from the template on first use, add the root files, install, and prepare
// the local database (start this workspace's Postgres, migrate, stop). No account needed, nothing started.
// --deploy: the same, then the deployed copy's one-time configuration (scripts/hosted.mjs).
import { parseArgs } from "node:util";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { writeRootFiles } from "./root-files.mjs";
import { applyShareFirewall, teamSpendCap } from "./share-firewall.mjs";
import { requireThat, safeError, setupHosted, workflowProject } from "./hosted.mjs";
const skill = dirname(dirname(fileURLToPath(import.meta.url)));
export async function setupLocal(workspace) {
  await mkdir(workspace, { recursive: true });
  const runtime = join(workspace, "workflows");
  if (!existsSync(join(runtime, "package.json"))) {
    requireThat(!existsSync(runtime) || !(await readdir(runtime)).length, "workflow_directory_not_empty", 409);
    await cp(join(skill, "templates"), runtime, { recursive: true, filter: (source) => {
      const path = source.replaceAll("\\", "/");
      return !/(?:^|\/)(?:node_modules|\.output|\.nitro|\.vercel|data|\.env(?:\.[^/]+)?)(?:\/|$)/.test(path) && !/public\/(?:viewer|connections)-assets/.test(path);
    } });
    await rename(join(runtime, "gitignore"), join(runtime, ".gitignore"));
    await rm(join(runtime, "env.example"), { force: true });
    await writeFile(join(runtime, "workflows/index.ts"), "export const workflows = {};\n");
  }
  // CI and the root ignore file sit outside workflows/; missing ones are added on every setup, existing ones are kept.
  await writeRootFiles(workspace);
  const run = (command, args) => {
    const windowsNpm = process.platform === "win32" && command === "npm";
    const result = spawnSync(windowsNpm ? "npm.cmd" : command, args, { cwd: runtime, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024, shell: windowsNpm });
    requireThat(result.status === 0, `local_setup_${args[0].split("/").pop().replace(/[^a-zA-Z0-9]/g, "_")}_failed`, 503);
  };
  if (!existsSync(join(runtime, "node_modules"))) run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
  run(process.execPath, ["scripts/build-viewer.mjs"]);
  // Start this workspace's Postgres, migrate it and stop it again. A running `npm run dev` already owns and migrated it.
  const { ensureLocalDatabase } = await import(pathToFileURL(join(runtime, "scripts/local-database.mjs")));
  requireThat(typeof ensureLocalDatabase === "function", "upgrade_workflow_runtime", 409, "Upgrade workflows/ to the current template first.");
  const database = await ensureLocalDatabase(runtime).catch((error) => { if (/^Already running/.test(error?.message)) return null; throw error; });
  if (database) try {
    const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], { cwd: runtime, stdio: "pipe", env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:DATABASE_URL|PG|POSTGRES_|VERCEL|GTM_DATABASE)/.test(name))) });
    requireThat(result.status === 0, "local_setup_migrate_failed", 503);
  } finally { await database.stop(); }
  return { status: "local_ready", workspace, next: `cd ${JSON.stringify(runtime)} && npm run dev, then open http://127.0.0.1:3939/viewer (Keys: http://127.0.0.1:3939/connections)` };
}
async function main() {
  // Not strict: gtm-agent setup passes its own flags (agent project, repository, …) through, which this script ignores.
  const { values } = parseArgs({ strict: false, options: { workspace: { type: "string" }, local: { type: "boolean" }, deploy: { type: "boolean" }, team: { type: "string" }, json: { type: "boolean" }, upgrade: { type: "boolean" }, "workflow-project": { type: "string" }, "share-project": { type: "string" } } });
  requireThat(values.workspace && Boolean(values.local) !== Boolean(values.deploy), "choose_local_or_deploy", 400);
  const workspace = resolve(values.workspace);
  let result = await setupLocal(workspace);
  if (values.deploy) {
    const target = workflowProject(workspace, { team: values.team, project: values["workflow-project"] });
    result = await setupHosted(target);
    // The public share project gets the template's rate limits on every hosted setup and upgrade; the spend cap is only checked.
    const shareProject = values["share-project"] ?? `${result.workflowName}-share`;
    let shareFirewall;
    try { shareFirewall = applyShareFirewall({ project: shareProject, team: target.team }); } catch (error) { shareFirewall = { project: shareProject, status: "failed", code: error.code }; }
    result = { ...result, shareFirewall, spendCap: teamSpendCap({ team: target.team }) };
  }
  console.log(JSON.stringify(result)); process.exitCode = result.status === "local_ready" ? 0 : 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
