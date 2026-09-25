#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { installComponent, componentSource } from "../connections/local/install.mjs";
import { workspaceState, privateJson, writePrivateJson } from "../connections/local/state.mjs";
import { inspectionEnvironment } from "../connections/local/inspection-environment.mjs";
import { safeError, requireThat } from "../connections/src/errors.mjs";
import { scaffoldManifest } from "./scaffold-manifest.mjs";
import { writeRootFiles } from "./root-files.mjs";
import { applyShareFirewall, teamSpendCap } from "./share-firewall.mjs";
const skill = dirname(dirname(fileURLToPath(import.meta.url)));
export async function setupLocal(workspace, { upgrade = false } = {}) {
  process.umask(0o077);
  await mkdir(workspace, { recursive: true });
  const state = await workspaceState(workspace, { create: true }), prior = await privateJson(state.configPath);
  const runtime = join(workspace, "workflows");
  let scaffold = prior?.scaffold;
  if (!existsSync(join(runtime, "package.json"))) {
    requireThat(!existsSync(runtime) || !(await (await import("node:fs/promises")).readdir(runtime)).length, "workflow_directory_not_empty", 409);
    await cp(join(skill, "templates"), runtime, { recursive: true, filter: (source) => {
      const path = source.replaceAll("\\", "/");
      return !/(?:^|\/)(?:node_modules|\.output|\.nitro|\.vercel|data|\.env(?:\.[^/]+)?)(?:\/|$)/.test(path) && !/public\/(?:viewer|connections)-assets/.test(path);
    } });
    await rename(join(runtime, "gitignore"), join(runtime, ".gitignore"));
    await rm(join(runtime, "env.example"), { force: true });
    await writeFile(join(runtime, "workflows/index.ts"), "export const workflows = {};\n");
    scaffold = await scaffoldManifest(runtime);
    await writePrivateJson(state.configPath, { ...prior, workspace: state.workspace, workspaceId: state.id, scaffold });
  }
  // CI and the root ignore file sit outside workflows/; missing ones are added on every setup, existing ones are kept.
  await writeRootFiles(workspace);
  const run = (command, args, cwd, env = inspectionEnvironment(process.env)) => {
    const windowsNpm = process.platform === "win32" && command === "npm";
    const result = spawnSync(windowsNpm ? "npm.cmd" : command, args, { cwd, env, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024, shell: windowsNpm });
    requireThat(result.status === 0, `local_setup_${args[0].split("/").pop().replace(/[^a-zA-Z0-9]/g, "_")}_failed`, 503);
  };
  const component = prior?.component && !upgrade ? prior.component : await installComponent();
  const { nativeStore } = await import(pathToFileURL(join(component.path, "local/storage.mjs")));
  const { openJournal } = await import(pathToFileURL(join(component.path, "src/journal.mjs")));
  requireThat(!prior || prior.workspace === state.workspace, "workspace_binding_changed", 409);
  const store = nativeStore(state.id);
  for (const name of ["GTM_RUN_SECRET", "GTM_CONNECTIONS_READ_SECRET"]) if (!store.loadForRuntime(name)) store.set(name, randomBytes(32).toString("base64url"));
  const journal = await openJournal({ url: `file:${state.database}` });
  const managedNames = (await journal.list()).map((row) => row.variable); journal.close();
  await writePrivateJson(state.configPath, { ...prior, workspace: state.workspace, workspaceId: state.id, component, scaffold,
    workflowsUrl: prior?.workflowsUrl ?? "http://127.0.0.1:3939/viewer" });
  if (!existsSync(join(runtime, "node_modules"))) run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], runtime);
  const env = { ...inspectionEnvironment(process.env, managedNames), GTM_ENV_MANAGED: "1", WORKFLOW_TARGET_WORLD: "local", WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "false" };
  // Database preparation is explicit. No execution server, queue or schedules start here.
  run(process.execPath, ["scripts/build-viewer.mjs"], runtime, env);
  // A workspace from before Postgres has no local-database script: there is nothing to prepare until it is converted.
  if (existsSync(join(runtime, "scripts/local-database.mjs"))) {
    const { ensureLocalDatabase, databaseEnvironment } = await import(pathToFileURL(join(component.path, "local/database.mjs"))).catch(() => ({}));
    requireThat(typeof ensureLocalDatabase === "function", "upgrade_connections_component", 409);
    // Start this workspace's Postgres, migrate it and stop it again, so `npm run viewer` works before any `npm run dev`.
    // A running launcher already owns the database and migrates it itself.
    const database = await ensureLocalDatabase(runtime).catch((error) => { if (/^Already running/.test(error?.message)) return null; throw error; });
    if (database) try { run(process.execPath, ["scripts/migrate.mjs"], runtime, databaseEnvironment(env, database.url)); } finally { await database.stop(); }
  }
  return { status: "local_ready", workspace: state.workspace, component: component.version,
    next: `node ${join(skill, "scripts/connections.mjs")} open --workspace ${JSON.stringify(state.workspace)} --target local` };
}
async function main() {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, local: { type: "boolean" }, deploy: { type: "boolean" }, team: { type: "string" }, "github-owner": { type: "string" }, json: { type: "boolean" }, upgrade: { type: "boolean" }, verification: { type: "string" }, "workflow-project": { type: "string" }, "share-project": { type: "string" }, "agent-project": { type: "string" }, "agent-repository": { type: "string" }, "intake-protection-verified": { type: "boolean" } } });
  requireThat(values.workspace && Boolean(values.local) !== Boolean(values.deploy), "choose_local_or_deploy");
  const workspace = resolve(values.workspace);
  const local = await setupLocal(workspace, { upgrade: values.upgrade });
  let result = local;
  if (values.deploy) {
    const state = await workspaceState(workspace), config = await privateJson(state.configPath);
    const { setupHosted } = await import(pathToFileURL(join(config.component.path, "setup/private-project.mjs")));
    result = await setupHosted({ workspace, team: values.team, githubOwner: values["github-owner"], upgrade: values.upgrade, verification: values.verification, workflowProject: values["workflow-project"], shareProject: values["share-project"], agentProject: values["agent-project"], agentRepository: values["agent-repository"], intakeProtectionVerified: values["intake-protection-verified"] });
    // The public share project gets the template's rate limits on every hosted setup and upgrade; the spend cap is only checked.
    const workflowName = (await privateJson(state.configPath))?.production?.workflowName;
    const shareProject = values["share-project"] ?? (workflowName && `${workflowName}-share`);
    const shareFirewall = !shareProject ? undefined : (() => { try { return applyShareFirewall({ project: shareProject, team: values.team }); } catch (error) { return { project: shareProject, status: "failed", code: error.code }; } })();
    result = { ...result, ...(shareFirewall ? { shareFirewall } : {}), spendCap: teamSpendCap({ team: values.team }) };
  }
  console.log(JSON.stringify(result)); process.exitCode = ["human_step", "deployment_required"].includes(result.status) ? 2 : 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
