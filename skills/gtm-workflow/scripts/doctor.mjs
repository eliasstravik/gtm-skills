#!/usr/bin/env node
// Doctor. --target local (default): the runtime is installed, root files match, and a Vercel link (if any) keeps
// production's database out of the Development environment. --target production: Vercel Authentication, the Keys
// page settings and the share rate limits. Exit 0 when ready, 2 when something needs doing, 1 when the check failed.
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
import { rootFileDrift } from "./root-files.mjs";
import { shareFirewallDrift, teamSpendCap } from "./share-firewall.mjs";
import { doctorHosted, requireThat, safeError, workflowProject } from "./hosted.mjs";

const DATABASE_VARIABLE = /^(?:DATABASE_URL|POSTGRES_|PG)/;
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

try {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, target: { type: "string", default: "local" }, team: { type: "string" }, "workflow-project": { type: "string" }, json: { type: "boolean" } } });
  requireThat(values.workspace, "workspace_required", 400, "Pass --workspace <path to the workspace>.");
  const workspace = resolve(values.workspace), runtime = join(workspace, "workflows");
  const target = workflowProject(workspace, { team: values.team, project: values["workflow-project"] });
  if (values.target === "production") {
    const result = await doctorHosted(target);
    // Missing or changed share rate limits are drift that hosted setup repairs; a missing spend cap is a team setting, so only a warning.
    const shareFirewall = shareFirewallDrift({ project: `${result.workflowName}-share`, team: target.team }), spendCap = teamSpendCap({ team: target.team });
    const ready = result.status === "production_ready" && ["current", "no_share_project"].includes(shareFirewall.status);
    console.log(JSON.stringify({ ...result, status: ready ? "production_ready" : result.status === "production_ready" ? "share_firewall_drift" : result.status, rootFiles: await rootFileDrift(workspace), shareFirewall, spendCap }));
    process.exitCode = ready ? 0 : 2;
  } else {
    const installed = existsSync(join(runtime, "package.json")) && existsSync(join(runtime, "node_modules"));
    const developmentDatabase = target.linked ? await productionInDevelopment(runtime) : { status: "not_linked" };
    const status = !installed ? "run_local_setup" : developmentDatabase.status === "production" ? "production_database_in_development" : "local_ready";
    console.log(JSON.stringify({ status, workspace, linked: target.linked, developmentDatabase, rootFiles: await rootFileDrift(workspace),
      ...(status === "production_database_in_development" ? { instruction: "In Vercel, open the Neon integration's settings for this project and untick Development for the production database." } : {}) }));
    process.exitCode = status === "local_ready" ? 0 : 2;
  }
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
