import { cp, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { componentDigest } from "../local/install.mjs";
import { privateDirectory, privateJson, writePrivateJson } from "../local/state.mjs";
import { captured, safeEnvironment } from "./cli.mjs";
import { verifyOwner } from "./bootstrap.mjs";
import { requireThat } from "../src/errors.mjs";

export async function waitForDeployment(api, id, { timeout = 12 * 60000, pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const deployment = await api("GET", `/v13/deployments/${encodeURIComponent(id)}`);
    if (deployment.readyState === "READY") return deployment;
    requireThat(!["ERROR", "CANCELED"].includes(deployment.readyState), "deployment_failed", 503);
    await pause(5000);
  }
  requireThat(false, "deployment_pending", 503);
}

async function findAttempt(api, projectId, attempt) {
  let cursor; const seen = new Set();
  for (let page = 0; page < 100; page++) {
    const result = await api("GET", `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=100${cursor === undefined ? "" : `&until=${encodeURIComponent(cursor)}`}`);
    requireThat(Array.isArray(result.deployments), "deployment_inventory_unavailable", 503);
    const matches = result.deployments.filter((deployment) => deployment.meta?.gtmSetupAttempt === attempt);
    requireThat(matches.length <= 1, "deployment_attempt_ambiguous", 409);
    if (matches.length) return matches[0];
    const next = result.pagination?.next;
    if (next === undefined || next === null) return null;
    requireThat(!seen.has(String(next)), "deployment_inventory_unavailable", 503); seen.add(String(next)); cursor = next;
  }
  requireThat(false, "deployment_inventory_unavailable", 503);
}

export async function deployAttempt({ api, projectId, journal, key, revision, submit, verify }) {
  const prior = await journal.get(key), same = prior?.revision === revision && prior.phase !== "failed";
  requireThat(!prior || prior.phase !== "deploy_attempted" || same, "prior_deployment_unresolved", 409);
  const attempt = same ? prior.attempt : randomUUID();
  let deployment = same && prior.deploymentId ? { id: prior.deploymentId } : same ? await findAttempt(api, projectId, attempt) : null;
  requireThat(!same || deployment, "deployment_creation_unresolved", 409);
  if (!deployment) {
    await journal.set(key, { phase: "deploy_attempted", attempt, revision });
    try { await submit(attempt); } catch { /* Discover the exact attempt before any retry. */ }
    deployment = await findAttempt(api, projectId, attempt);
    requireThat(deployment, "deployment_creation_unresolved", 409);
  }
  const id = deployment.id ?? deployment.uid;
  await journal.set(key, { phase: "deploy_created", attempt, revision, deploymentId: id });
  let ready;
  try { ready = await waitForDeployment(api, id); }
  catch (error) {
    if (error.code === "deployment_failed") await journal.set(key, { phase: "failed", attempt, revision, deploymentId: id });
    throw error;
  }
  requireThat(ready.projectId === projectId && ready.meta?.gtmSetupAttempt === attempt, "deployed_project_mismatch", 403);
  await verify(ready);
  await journal.set(key, { phase: "deployed", attempt, revision, deploymentId: id });
  return { deploymentId: id, url: `https://${ready.url}` };
}

export async function deployGitProject({ api, fixed, project, commit, journal }) {
  await verifyOwner(api, fixed);
  requireThat(project.accountId === fixed.teamId && project.link?.type === "github" && project.link.repoId && /^[a-f0-9]{40}$/.test(commit), "deployment_source_unverified", 403);
  const env = await safeEnvironment(api, project.id);
  const revision = createHash("sha256").update(JSON.stringify({ commit, settings: [project.rootDirectory, project.buildCommand, project.framework, project.nodeVersion],
    env: env.map((row) => ({ id: row.id, updatedAt: row.updatedAt, target: row.target })).sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
  return deployAttempt({ api, projectId: project.id, journal, key: `deployment:${project.id}`, revision,
    submit: async (attempt) => {
      await verifyOwner(api, fixed);
      return api("POST", "/v13/deployments", { name: project.name, project: project.id, target: "production", meta: { gtmSetupAttempt: attempt, gtmConfigurationRevision: revision },
        gitSource: { type: "github", repoId: project.link.repoId, ref: project.link.productionBranch ?? "main", sha: commit } });
    },
    verify: async (ready) => {
      requireThat(ready.meta?.githubCommitSha === commit && ready.meta?.gtmConfigurationRevision === revision, "deployed_source_mismatch", 403);
      const current = await api("GET", `/v9/projects/${project.id}`);
      requireThat((current.targets?.production?.id ?? current.targets?.production?.uid) === (ready.id ?? ready.uid), "production_deployment_changed", 409);
    } });
}

/** Only the immutable manager distribution is uploaded. Authored workspace code is never an input. */
export async function deployManager({ api, fixed, state, component, journal, run = captured }) {
  await verifyOwner(api, fixed);
  const components = join(homedir(), ".gtm", "components");
  requireThat(relative(components, component.path) === `${component.version}-${component.digest}` &&
    await componentDigest(component.path) === component.digest, "component_digest_mismatch", 403);
  const provenance = await privateJson(join(component.path, "provenance.json"));
  requireThat(provenance && provenance.development === false && /^[a-f0-9]{40}$/.test(provenance.sourceCommit) &&
    provenance.sourceCommit === component.sourceCommit, "released_component_required", 409);
  const env = await safeEnvironment(api, fixed.adminProjectId);
  const revision = createHash("sha256").update(JSON.stringify(env.map((row) => ({ id: row.id, updatedAt: row.updatedAt, target: row.target })).sort((a, b) => a.id.localeCompare(b.id)))).digest("hex");
  return deployAttempt({ api, projectId: fixed.adminProjectId, journal, key: "manager_deployment", revision: `${component.digest}:${revision}`,
    submit: async (attempt) => {
      await verifyOwner(api, fixed);
      const staging = await privateDirectory(join(state.directory, "deploy", attempt));
      const excluded = new Set(["local", "setup", "tests", "node_modules", ".git", ".vercel", "installation.json"]);
      for (const entry of await readdir(component.path, { withFileTypes: true })) {
        if (excluded.has(entry.name)) continue;
        requireThat(!entry.isSymbolicLink(), "symlink_in_component", 403);
        await cp(join(component.path, entry.name), join(staging, entry.name), { recursive: true, errorOnExist: true, force: false });
      }
      await privateDirectory(join(staging, ".vercel"));
      await writePrivateJson(join(staging, ".vercel", "project.json"), { projectId: fixed.adminProjectId, orgId: fixed.teamId });
      run("vercel", ["deploy", "--prod", "--yes", "--non-interactive", "--scope", fixed.team,
        "--meta", `gtmSetupAttempt=${attempt}`, "--meta", `gtmComponentDigest=${component.digest}`,
        "--meta", `gtmSourceCommit=${component.sourceCommit}`, "--meta", `gtmComponentVersion=${component.version}`,
        "--meta", `gtmConfigurationRevision=${revision}`], { cwd: staging });
    },
    verify: async (ready) => {
      requireThat(ready.meta?.gtmComponentDigest === component.digest && ready.meta?.gtmConfigurationRevision === revision &&
        ready.meta?.gtmSourceCommit === component.sourceCommit, "deployed_component_mismatch", 403);
      const current = await api("GET", `/v9/projects/${fixed.adminProjectId}`);
      requireThat(!current.link && (current.targets?.production?.id ?? current.targets?.production?.uid) === (ready.id ?? ready.uid), "production_deployment_changed", 409);
    } });
}
