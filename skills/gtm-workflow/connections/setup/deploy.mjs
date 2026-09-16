import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { workspaceState, privateJson, writePrivateJson } from "../local/state.mjs";
import { installComponent } from "../local/install.mjs";
import { nativeStore } from "../local/storage.mjs";
import { openJournal } from "../src/journal.mjs";
import { requireThat } from "../src/errors.mjs";
import { captured, ownerApi, safeEnvironment, cliCapabilities } from "./cli.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
import { setupLock } from "./lock.mjs";
import { currentMember } from "../src/vercel.mjs";
import { verifyOwner, installStagedGrant } from "./bootstrap.mjs";
import { deployManager, deployGitProject } from "./deployment.mjs";
import { prepareSharing } from "./viewer.mjs";
import { productionCommand } from "./production-command.mjs";
import { ensureProject, ensureDatabase } from "./resources.mjs";

export async function setupHosted(options) {
  const state = await workspaceState(options.workspace), release = await setupLock(state);
  try { return await provisionHosted(options); } finally { await release(); }
}
async function provisionHosted({ workspace, team, githubOwner, upgrade = false }) {
  requireThat(typeof team === "string" && /^[a-z0-9-]+$/.test(team), "team_required");
  const state = await workspaceState(workspace, { create: true }), config = await privateJson(state.configPath, {});
  const api = ownerApi(team);
  const teamResult = await api("GET", `/v2/teams/${encodeURIComponent(team)}`), teamData = teamResult.team ?? teamResult;
  const user = (await api("GET", "/v2/user")).user;
  requireThat(teamData.id && user?.id && (await currentMember(api, teamData.id, user.id)).role === "OWNER", "cli_owner_required", 403);
  const remote = captured("git", ["remote", "get-url", "origin"], { cwd: workspace }).trim();
  const match = /(?:github\.com[:/])([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote);
  requireThat(match && (!githubOwner || match[1].toLowerCase() === githubOwner.toLowerCase()), "workspace_repository_required");
  const owner = match[1], repo = match[2], workflowName = `${repo}-workflows`, adminName = `${repo}-connections`;
  const journal = await openJournal({ url: `file:${state.database}` });
  try {
  const component = config.component ?? await installComponent();
  const workflow = await ensureProject({ api, journal, teamId: teamData.id, definition: { name: workflowName, framework: "nitro", rootDirectory: "workflows", gitRepository: { type: "github", repo: `${owner}/${repo}` }, ssoProtection: { deploymentType: "all" } } });
  const admin = await ensureProject({ api, journal, teamId: teamData.id, definition: { name: adminName, framework: null, ssoProtection: { deploymentType: "all" } } });
  const fixed = { teamId: teamData.id, ownerId: user.id, projectId: workflow.id, adminProjectId: admin.id };
  requireThat(!config.production || (config.production.projectId === fixed.projectId && config.production.adminProjectId === fixed.adminProjectId && config.production.teamId === fixed.teamId), "production_binding_changed", 409);
  await verifyOwner(api, fixed);
  const production = { ...config.production, ...fixed, team, workflowName, adminName, origin: `https://${adminName}.vercel.app`, runtimeOrigin: `https://${workflowName}.vercel.app`, component };
  await writePrivateJson(state.configPath, { ...config, workspace: state.workspace, workspaceId: state.id, component, production });
    const configure = async (projectId, key, value, options = {}) => {
      await verifyOwner(api, fixed);
      return writeSetupConfiguration({ api, journal, projectId, key, value, ...options });
    };
    await journal.set("provisioning", { phase: "owner_verified", ...fixed });
    for (const project of [workflow, admin]) {
      const database = await ensureDatabase({ api, team, project, fixed, state, journal });
      if (database.status === "human_step") return database;
    }
    for (const [project, settings] of [[workflow, { rootDirectory: "workflows", framework: "nitro", nodeVersion: "22.x", autoExposeSystemEnvs: true, previewDeploymentsDisabled: true }], [admin, { framework: null, nodeVersion: "22.x", previewDeploymentsDisabled: true, ssoProtection: { deploymentType: "all" } }]])
      await api("PATCH", `/v9/projects/${project.id}`, settings);
    const store = nativeStore(`${state.id}/setup`);
    const secret = async (name) => {
      let value = store.loadForRuntime(name);
      if (!value) {
        requireThat(!await journal.get(`generated:${name}`), "setup_credential_missing", 409);
        value = randomBytes(32).toString("base64url"); store.set(name, value);
      }
      await journal.set(`generated:${name}`, { present: true }); return value;
    };
    const workflowEnv = await safeEnvironment(api, workflow.id);
    if (!workflowEnv.some((row) => row.key === "GTM_RUN_SECRET")) {
      const value = await secret("MACHINE_RUN_SECRET");
      await configure(workflow.id, "GTM_RUN_SECRET", value);
      if (!workflowEnv.some((row) => row.key === "CRON_SECRET")) await configure(workflow.id, "CRON_SECRET", value);
    }
    const bypass = await secret("RUNTIME_BYPASS");
    let gate = await api("GET", `/v9/projects/${workflow.id}`);
    if (!Object.hasOwn(gate.protectionBypass ?? {}, bypass)) {
      requireThat(!await journal.get("runtime_bypass"), "runtime_bypass_unresolved", 409);
      await journal.set("runtime_bypass", { phase: "write_attempted" });
      try { await api("PATCH", `/v10/projects/${workflow.id}/protection-bypass`, { generate: { secret: bypass, note: "Connections read transport" } }); } catch { /* Reconcile the generated value internally, without printing gate credentials. */ }
      gate = await api("GET", `/v9/projects/${workflow.id}`);
      requireThat(Object.hasOwn(gate.protectionBypass ?? {}, bypass), "runtime_bypass_unresolved", 409);
    }
    await journal.set("runtime_bypass", { phase: "saved" });
    await configure(workflow.id, "GTM_CONNECTIONS_READ_SECRET", await secret("RUNTIME_READ_SECRET"));
    await configure(admin.id, "GTM_CONNECTIONS_READ_SECRET", await secret("RUNTIME_READ_SECRET"));
    await configure(admin.id, "CONNECTIONS_RUNTIME_BYPASS", bypass);
    await configure(admin.id, "CONNECTIONS_SESSION_SECRET", await secret("SESSION_SECRET"));
    await configure(workflow.id, "GTM_CONNECTIONS_ORIGIN", production.origin, { secret: false });
    await configure(workflow.id, "GTM_VIEWER_PROTECTED", "1", { secret: false });
    for (const [key, value] of Object.entries({ CONNECTIONS_TEAM_ID: fixed.teamId, CONNECTIONS_PROJECT_ID: fixed.projectId, CONNECTIONS_TEAM_SLUG: team, CONNECTIONS_PROJECT_NAME: workflowName, CONNECTIONS_ORIGIN: production.origin, CONNECTIONS_RUNTIME_ORIGIN: production.runtimeOrigin }))
      await configure(admin.id, key, value, { secret: false });
    // Provisioning only: no provider credentials are read or copied from Local.
    const stage = await journal.get("bootstrap");
    if (stage && ["admin_configured", "deployed_verified", "complete"].includes(stage.phase)) {
      if (stage.phase === "admin_configured") await installStagedGrant({ api, fixed: { ...fixed, integrationId: production.integrationId }, journal, store });
      let source = await journal.get("workflow_source");
      if (!source || upgrade) {
        const repository = JSON.parse(captured("gh", ["api", `repos/${owner}/${repo}`]));
        const commit = captured("gh", ["api", `repos/${owner}/${repo}/commits/${encodeURIComponent(repository.default_branch)}`, "--jq", ".sha"]).trim();
        requireThat(/^[a-f0-9]{40}$/.test(commit), "workflow_source_unverified", 409);
        source = { owner, repo, commit }; await journal.set("workflow_source", source);
      }
      requireThat(source.owner === owner && source.repo === repo, "workflow_source_binding_changed", 409);
      const share = await prepareSharing({ api, fixed, workflow, owner, repo, runtimeOrigin: production.runtimeOrigin, journal });
      await deployGitProject({ api, fixed, project: share, commit: source.commit, journal });
      await configure(workflow.id, "GTM_VIEWER_SHARE_ORIGIN", `https://${share.name}.vercel.app`, { secret: false });
      const currentWorkflow = await api("GET", `/v9/projects/${workflow.id}`);
      const runtime = await deployGitProject({ api, fixed, project: currentWorkflow, commit: source.commit, journal });
      const manager = await deployManager({ api, fixed: { ...fixed, team }, state, component, journal });
      const snapshot = await productionCommand("list", state, { production });
      requireThat(snapshot.deploymentId === runtime.deploymentId && snapshot.commit === source.commit, "deployed_runtime_mismatch", 503);
      await journal.set("live_deployments", { workflow: runtime.deploymentId, manager: manager.deploymentId, commit: source.commit });
      return { status: "human_step", stage: "verify_human_access", projectId: workflow.id, adminProjectId: admin.id,
        origin: production.origin, instruction: "Open Connections, sign in with Vercel, and verify organization access and connection changes before completing setup." };
    }
    const capabilities = await cliCapabilities();
    await journal.set("capabilities", capabilities);
    return { status: "human_step", stage: "register_identity_and_integration", team, projectId: workflow.id, adminProjectId: admin.id,
      capability: "Identity settings and private integration registration require the documented dashboard flow.",
      next: `node ${join(component.path, "setup/registration.mjs")} --workspace ${JSON.stringify(workspace)}` };
  } finally { journal.close(); }
}
export async function doctorHosted(state, config) {
  requireThat(config.production, "run_hosted_setup", 409);
  const p = config.production, api = ownerApi(p.team); await verifyOwner(api, p);
  const workflow = await api("GET", `/v9/projects/${p.projectId}`), admin = await api("GET", `/v9/projects/${p.adminProjectId}`);
  requireThat(!admin.link && admin.ssoProtection?.deploymentType === "all" && workflow.ssoProtection?.deploymentType === "all", "private_boundaries_unverified", 409);
  const names = (await safeEnvironment(api, admin.id)).map((row) => row.key);
  const required = ["CONNECTIONS_CLIENT_ID", "CONNECTIONS_CLIENT_SECRET", "CONNECTIONS_INSTALLATION_ID", "CONNECTIONS_INTEGRATION_TOKEN", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
  const missing = required.filter((name) => !names.includes(name));
  return { status: missing.length ? "setup_incomplete" : "verification_required", missing, projectId: p.projectId, adminProjectId: p.adminProjectId, sourceIsolated: true };
}
