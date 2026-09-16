import { join } from "node:path";
import { privateDirectory, writePrivateJson } from "../local/state.mjs";
import { captured, safeEnvironment } from "./cli.mjs";
import { requireThat } from "../src/errors.mjs";

export async function projectByName(api, name) {
  const seen = new Set(); let cursor;
  for (let page = 0; page < 100; page++) {
    const result = await api("GET", `/v9/projects?limit=100${cursor === undefined ? "" : `&until=${encodeURIComponent(cursor)}`}`);
    requireThat(Array.isArray(result.projects), "project_inventory_incomplete", 503);
    const found = result.projects.find((project) => project.name === name);
    if (found) return found;
    const next = result.pagination?.next;
    if (next === null || next === undefined && !result.pagination?.hasNext) return null;
    requireThat((typeof next === "number" || typeof next === "string") && !seen.has(String(next)), "project_inventory_incomplete", 503);
    seen.add(String(next)); cursor = next;
  }
  requireThat(false, "project_inventory_incomplete", 503);
}

export async function ensureProject({ api, journal, teamId, definition }) {
  const key = `project:${definition.name}`, prior = await journal.get(key);
  let project = await projectByName(api, definition.name);
  if (!project) {
    requireThat(!prior || prior.phase === "access_required", "project_creation_unresolved", 409);
    await journal.set(key, { phase: "create_attempted", name: definition.name, teamId });
    try { await api("POST", "/v10/projects", definition); } catch (error) {
      if (error.code === "github_repository_access_required") {
        await journal.set(key, { phase: "access_required", name: definition.name, teamId });
        throw error;
      }
      // A lost response may still have created the project.
    }
    project = await projectByName(api, definition.name);
    requireThat(project, "project_creation_unresolved", 409);
  }
  requireThat(project.accountId === teamId && (!prior?.projectId || prior.projectId === project.id), "project_binding_changed", 403);
  if (definition.gitRepository) {
    const [owner, repo] = definition.gitRepository.repo.split("/");
    requireThat(project.link?.type === "github" && project.link.org?.toLowerCase() === owner.toLowerCase() && project.link.repo === repo, "project_repository_mismatch", 403);
  } else requireThat(!project.link, "admin_source_not_isolated", 403);
  await journal.set(key, { phase: "bound", name: definition.name, teamId, projectId: project.id });
  return project;
}

/** CLI linkage lives in user-owned setup state, never in the authored workspace. */
export async function linkedDirectory(state, fixed, project) {
  const cwd = await privateDirectory(join(state.directory, "provisioning", project.id));
  await privateDirectory(join(cwd, ".vercel"));
  await writePrivateJson(join(cwd, ".vercel", "project.json"), { projectId: project.id, orgId: fixed.teamId, projectName: project.name });
  return cwd;
}

export async function ensureDatabase({ api, team, project, fixed, state, journal, run = captured }) {
  const names = async () => new Set((await safeEnvironment(api, project.id)).filter((row) => row.target?.includes("production")).map((row) => row.key));
  const initial = await names();
  if (initial.has("TURSO_DATABASE_URL") && initial.has("TURSO_AUTH_TOKEN")) return { status: "configured" };
  requireThat(!initial.has("TURSO_DATABASE_URL") && !initial.has("TURSO_AUTH_TOKEN"), "database_configuration_incomplete", 409);
  const name = `${project.name}-db`, key = `database:${project.id}`, cwd = await linkedDirectory(state, fixed, project);
  const list = () => {
    const result = JSON.parse(run("vercel", ["integration", "list", "--all", "--json", "--scope", team, "--non-interactive"]));
    requireThat(Array.isArray(result.resources), "database_inventory_unavailable", 503);
    const matches = result.resources.filter((resource) => resource.name === name);
    requireThat(matches.length <= 1, "database_name_ambiguous", 409);
    const resource = matches[0];
    requireThat(!resource || resource.product === "Turso" && resource.status === "available" &&
      Array.isArray(resource.projects) && resource.projects.every((bound) => bound === project.name), "database_binding_denied", 403);
    return resource;
  };
  let resource = list();
  const prior = await journal.get(key);
  const browserStep = () => ({ status: "human_step", stage: "database_browser_setup", projectId: project.id,
    instruction: "Complete the Turso marketplace setup opened by Vercel, then resume. No database credentials need to be copied." });
  if (!resource && prior?.phase === "browser_required") return browserStep();
  if (!resource) {
    requireThat(!prior || prior.phase !== "create_attempted", "database_creation_unresolved", 409);
    await journal.set(key, { phase: "create_attempted", name });
    try {
      run("vercel", ["integration", "add", "tursocloud/database", "--name", name, "--plan", "starter", "-m", "region=iad1",
        "--no-connect", "--no-env-pull", "--json", "--scope", team, "--non-interactive"], { cwd });
    } catch (error) {
      resource = list();
      if (!resource) {
        if (error.code === "marketplace_browser_setup_required") {
          await journal.set(key, { phase: "browser_required", name });
          return browserStep();
        }
        if (error.code !== "marketplace_terms_required") throw error;
        await journal.set(key, { phase: "terms_required", name });
        return { status: "human_step", stage: "database_terms", projectId: project.id,
          next: `vercel integration accept-terms tursocloud --scope ${team}`, instruction: "Accept Turso marketplace terms in a terminal, then resume setup." };
      }
    }
    resource ??= list(); requireThat(resource, "database_creation_unresolved", 409);
  }
  await journal.set(key, { phase: "resource_found", name, resourceId: resource.id });
  if (!resource.projects.includes(project.name)) run("vercel", ["integration", "resource", "connect", resource.id, project.name,
    "--environment", "production", "--json", "--yes", "--scope", team, "--non-interactive"], { cwd });
  const installed = await names();
  requireThat(installed.has("TURSO_DATABASE_URL") && installed.has("TURSO_AUTH_TOKEN"), "database_connection_unverified", 503);
  await journal.set(key, { phase: "configured", name, resourceId: resource.id });
  return { status: "configured", resourceId: resource.id };
}
