import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { workspaceState, privateJson, writePrivateJson } from "../local/state.mjs";
import { installComponent } from "../local/install.mjs";
import { nativeStore } from "../local/storage.mjs";
import { openJournal } from "../src/journal.mjs";
import { requireThat } from "../src/errors.mjs";
import { captured, ownerApi, safeEnvironment, configurationValue, cliCapabilities } from "./cli.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
import { setupLock } from "./lock.mjs";
import { currentMember, validateInstallation } from "../src/vercel.mjs";
import { providerVariable } from "../dist/catalog.mjs";
import { verifyOwner, installStagedGrant } from "./bootstrap.mjs";
import { deployManager, deployGitProject } from "./deployment.mjs";
import { prepareSharing } from "./viewer.mjs";
import { productionCommand } from "./production-command.mjs";
import { finishHostedSetup, readVerification } from "./verification.mjs";
import { prepareAgent } from "./agent.mjs";
import { ensureWorkspaceRepository } from "./repository.mjs";
import { projectByName } from "./resources.mjs";
import { ensureProject, ensureDatabase } from "./resources.mjs";

export async function setupHosted(options) {
  const state = await workspaceState(options.workspace), release = await setupLock(state);
  try { return await provisionHosted(options); } finally { await release(); }
}
async function provisionHosted({ workspace, team, githubOwner, upgrade = false, verification, workflowProject, shareProject, agentProject, agentRepository, intakeProtectionVerified = false }) {
  requireThat(typeof team === "string" && /^[a-z0-9-]+$/.test(team), "team_required");
  const state = await workspaceState(workspace, { create: true }), config = await privateJson(state.configPath, {});
  const api = ownerApi(team);
  const teamResult = await api("GET", `/v2/teams/${encodeURIComponent(team)}`), teamData = teamResult.team ?? teamResult;
  const user = (await api("GET", "/v2/user")).user;
  requireThat(teamData.id && user?.id && (await currentMember(api, teamData.id, user.id)).role === "OWNER", "cli_owner_required", 403);
  requireThat(!config.production || config.production.ownerId === user.id && config.production.teamId === teamData.id, "production_owner_changed", 403);
  const journal = await openJournal({ url: `file:${state.database}` });
  try {
  const { owner, repo } = await ensureWorkspaceRepository({ workspace, githubOwner, config, journal });
  const workflowName = workflowProject ?? config.production?.workflowName ?? `${repo}-workflows`, adminName = `${repo}-connections`;
  shareProject ??= config.production?.shareProject ?? `${workflowName}-share`;
  agentProject ??= config.production?.agentProject; agentRepository ??= config.production?.agentRepository;
  requireThat(!config.production?.agentProject || config.production.agentProject === agentProject && config.production.agentRepository === agentRepository, "agent_project_binding_denied", 403);
  for (const name of [workflowName, adminName, shareProject, ...(agentProject ? [agentProject] : [])]) requireThat(/^[a-z0-9][a-z0-9-]{0,99}$/.test(name), "invalid_project_name");
  requireThat(!config.production?.repository || config.production.repository === `${owner}/${repo}`, "production_repository_changed", 409);
  const component = config.component ?? await installComponent();
  const workflow = await ensureProject({ api, journal, teamId: teamData.id, definition: { name: workflowName, framework: "nitro", rootDirectory: "workflows", gitRepository: { type: "github", repo: `${owner}/${repo}` }, ssoProtection: { deploymentType: "all" } } });
  const admin = await ensureProject({ api, journal, teamId: teamData.id, definition: { name: adminName, framework: null, ssoProtection: { deploymentType: "all" } } });
  const fixed = { teamId: teamData.id, ownerId: user.id, projectId: workflow.id, adminProjectId: admin.id };
  requireThat(!config.production || (config.production.projectId === fixed.projectId && config.production.adminProjectId === fixed.adminProjectId && config.production.teamId === fixed.teamId), "production_binding_changed", 409);
  await verifyOwner(api, fixed);
  const production = { ...config.production, ...fixed, team, workflowName, adminName, shareProject, agentProject, agentRepository, repository: `${owner}/${repo}`,
    origin: `https://${adminName}.vercel.app`, runtimeOrigin: `https://${workflowName}.vercel.app`, component };
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
    requireThat(await configurationValue(api, workflow.id, "TURSO_DATABASE_URL") !== await configurationValue(api, admin.id, "TURSO_DATABASE_URL"), "administration_database_not_isolated", 403);
    for (const [project, settings] of [[workflow, { rootDirectory: "workflows", framework: "nitro", nodeVersion: "22.x", autoExposeSystemEnvs: true, previewDeploymentsDisabled: true }], [admin, { framework: null, nodeVersion: "22.x", previewDeploymentsDisabled: true, ssoProtection: { deploymentType: "all" } }]])
      await api("PATCH", `/v9/projects/${project.id}`, settings);
    const store = nativeStore(`${state.id}/setup`);
    const secret = async (name, encoding = "base64url") => {
      let value = store.loadForRuntime(name);
      if (!value) {
        requireThat(!await journal.get(`generated:${name}`), "setup_credential_missing", 409);
        value = randomBytes(32).toString(encoding); store.set(name, value);
      }
      await journal.set(`generated:${name}`, { present: true }); return value;
    };
    let agent;
    if (agentProject) {
      requireThat(typeof agentRepository === "string" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(agentRepository), "agent_repository_required");
      agent = await projectByName(api, agentProject); requireThat(agent, "agent_project_missing", 409);
      agent = await prepareAgent({ api, fixed, workflow, agent, agentRepository, journal, secret, runtimeOrigin: production.runtimeOrigin });
      let source = await journal.get("agent_source");
      if (!source || upgrade) {
        const commit = agent.targets?.production?.meta?.githubCommitSha;
        requireThat(typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit), "agent_source_unverified", 409);
        source = { repository: agentRepository, commit }; await journal.set("agent_source", source);
      }
      requireThat(source.repository === agentRepository, "agent_source_binding_changed", 409);
      await deployGitProject({ api, fixed, project: agent, commit: source.commit, journal });
    }
    const workflowEnv = (await safeEnvironment(api, workflow.id)).filter((row) => row.target?.includes("production"));
    if (!workflowEnv.some((row) => row.key === "GTM_VIEWER_LINK_KEY"))
      await configure(workflow.id, "GTM_VIEWER_LINK_KEY", await secret("VIEWER_LINK_KEY", "hex"));
    if (!workflowEnv.some((row) => row.key === "GTM_RUN_SECRET")) {
      const value = await secret("MACHINE_RUN_SECRET");
      await configure(workflow.id, "GTM_RUN_SECRET", value);
      if (!workflowEnv.some((row) => row.key === "CRON_SECRET")) await configure(workflow.id, "CRON_SECRET", value);
    }
    if (!workflowEnv.some((row) => row.key === "CRON_SECRET") && await journal.get(`configuration:${workflow.id}:GTM_RUN_SECRET`))
      await configure(workflow.id, "CRON_SECRET", await secret("MACHINE_RUN_SECRET"));
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
    if (workflow.ssoProtection?.deploymentType !== "all") {
      const registry = JSON.parse(captured("gh", ["api", `repos/${owner}/${repo}/contents/workflows/workflows/index.ts`]));
      requireThat(intakeProtectionVerified || !/\bintake\s*[:,}]/.test(Buffer.from(registry.content ?? "", "base64").toString()), "verify_intake_gate_before_protection", 409);
      await api("PATCH", `/v9/projects/${workflow.id}`, { ssoProtection: { deploymentType: "all" } });
    }
    for (const [key, value] of Object.entries({ CONNECTIONS_TEAM_ID: fixed.teamId, CONNECTIONS_PROJECT_ID: fixed.projectId, CONNECTIONS_TEAM_SLUG: team, CONNECTIONS_PROJECT_NAME: workflowName, CONNECTIONS_ORIGIN: production.origin, CONNECTIONS_RUNTIME_ORIGIN: production.runtimeOrigin, CONNECTIONS_COMPONENT_DIGEST: component.digest }))
      await configure(admin.id, key, value, { secret: false, update: upgrade && key === "CONNECTIONS_COMPONENT_DIGEST" });
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
      const share = await prepareSharing({ api, fixed, workflow, owner, repo, runtimeOrigin: production.runtimeOrigin, journal, name: shareProject });
      await deployGitProject({ api, fixed, project: share, commit: source.commit, journal });
      await configure(workflow.id, "GTM_VIEWER_SHARE_ORIGIN", `https://${share.name}.vercel.app`, { secret: false });
      const currentWorkflow = await api("GET", `/v9/projects/${workflow.id}`);
      const runtime = await deployGitProject({ api, fixed, project: currentWorkflow, commit: source.commit, journal });
      const manager = await deployManager({ api, fixed: { ...fixed, team }, state, component, journal });
      const snapshot = await productionCommand("list", state, { production });
      requireThat(snapshot.deploymentId === runtime.deploymentId && snapshot.commit === source.commit, "deployed_runtime_mismatch", 503);
      await journal.set("live_deployments", { workflow: runtime.deploymentId, manager: manager.deploymentId, commit: source.commit });
      const health = await doctorHosted(state, { ...config, component, production });
      requireThat(["verification_required", "production_ready"].includes(health.status), "hosted_setup_incomplete", 409);
      if (verification || ["complete", "deployed_verified"].includes(stage.phase)) return await finishHostedSetup({ api, fixed: { ...production, ...fixed }, state, component, journal,
        receipt: verification ? await readVerification(verification) : null, runtime, manager, commit: source.commit, store });
      return { status: "human_step", stage: "verify_human_access", projectId: workflow.id, adminProjectId: admin.id,
        origin: production.origin, instruction: "Sign in with Vercel, open Setup verification, and download verification. Resume setup with --verification followed by the downloaded file path." };
    }
    const capabilities = await cliCapabilities();
    await journal.set("capabilities", capabilities);
    return { status: "human_step", stage: "register_identity_and_integration", team, projectId: workflow.id, adminProjectId: admin.id,
      capability: "Identity settings and private integration registration require the documented dashboard flow.",
      next: `node ${join(component.path, "setup/registration.mjs")} --workspace ${JSON.stringify(workspace)}` };
  } finally { journal.close(); }
}
export async function doctorHosted(state, config, { api = ownerApi(config.production?.team), readRuntime = productionCommand } = {}) {
  requireThat(config.production, "run_hosted_setup", 409);
  const p = config.production; await verifyOwner(api, p);
  const workflow = await api("GET", `/v9/projects/${p.projectId}`), admin = await api("GET", `/v9/projects/${p.adminProjectId}`);
  requireThat(!admin.link && admin.ssoProtection?.deploymentType === "all" && workflow.ssoProtection?.deploymentType === "all", "private_boundaries_unverified", 409);
  const env = (await safeEnvironment(api, admin.id)).filter((row) => row.target?.includes("production")), names = env.map((row) => row.key);
  const required = ["CONNECTIONS_CLIENT_ID", "CONNECTIONS_CLIENT_SECRET", "CONNECTIONS_INSTALLATION_ID", "CONNECTIONS_INTEGRATION_TOKEN", "TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];
  const missing = required.filter((name) => !names.includes(name));
  if (missing.length) return { status: "setup_incomplete", missing, projectId: p.projectId, adminProjectId: p.adminProjectId, sourceIsolated: true };
  for (const name of ["CONNECTIONS_CLIENT_SECRET", "CONNECTIONS_INTEGRATION_TOKEN", "CONNECTIONS_SESSION_SECRET", "GTM_CONNECTIONS_READ_SECRET", "CONNECTIONS_RUNTIME_BYPASS", "TURSO_AUTH_TOKEN"])
    requireThat(env.filter((row) => row.key === name && row.visibility === "secret" && row.target.length === 1).length === 1, "administrator_secret_storage_unverified", 403);
  requireThat(!names.some((name) => providerVariable(name) || ["GTM_RUN_SECRET", "GTM_NOTIFY_SECRET", "GTM_GITHUB_TOKEN"].includes(name)), "administrator_has_workflow_credentials", 403);
  requireThat(await configurationValue(api, workflow.id, "TURSO_DATABASE_URL") !== await configurationValue(api, admin.id, "TURSO_DATABASE_URL"), "administration_database_not_isolated", 403);
  const journal = await openJournal({ url: `file:${state.database}` });
  try {
    const bootstrap = await journal.get("bootstrap"), verified = await journal.get("verified_setup"), live = await journal.get("live_deployments");
    requireThat(bootstrap?.installationId && p.integrationId, "installation_binding_unverified", 409);
    validateInstallation(await api("GET", `/v1/integrations/configuration/${encodeURIComponent(bootstrap.installationId)}`), { ...p, installationId: bootstrap.installationId });
    const share = await projectByName(api, p.shareProject ?? `${p.workflowName}-share`);
    requireThat(share?.accountId === p.teamId && share.buildCommand === "npm run build:share" && share.rootDirectory === "workflows", "share_boundary_unverified", 403);
    requireThat(`${share.link?.org}/${share.link?.repo}`.toLowerCase() === p.repository?.toLowerCase() &&
      JSON.stringify(workflow.trustedSources?.projects?.[share.id]?.customAllow) === JSON.stringify([{ from: { slugs: ["production"] }, to: { slugs: ["production"] } }]), "share_boundary_unverified", 403);
    for (const [project, origin] of [[workflow, p.runtimeOrigin], [admin, p.origin], [share, `https://${share.name}.vercel.app`]])
      requireThat(project.targets?.production?.alias?.includes(new URL(origin).hostname), "production_alias_unverified", 409);
    const shareNames = (await safeEnvironment(api, share.id)).map((row) => row.key);
    requireThat(shareNames.every((name) => ["GTM_VIEWER_PRIVATE_ORIGIN", "GTM_VIEWER_PRIVATE_PROJECT_ID"].includes(name)), "share_has_unexpected_configuration", 403);
    requireThat(await configurationValue(api, share.id, "GTM_VIEWER_PRIVATE_ORIGIN") === p.runtimeOrigin &&
      await configurationValue(api, share.id, "GTM_VIEWER_PRIVATE_PROJECT_ID") === p.projectId, "share_boundary_unverified", 403);
    const runtime = await readRuntime("list", state, config);
    const managerId = admin.targets?.production?.id ?? admin.targets?.production?.uid;
    const manager = managerId ? await api("GET", `/v13/deployments/${managerId}`) : null;
    requireThat(manager?.readyState === "READY" && manager.projectId === p.adminProjectId && manager.meta?.gtmComponentDigest === config.component.digest &&
      manager.meta?.gtmSourceCommit === config.component.sourceCommit, "administrator_deployment_unverified", 409);
    const ready = bootstrap.phase === "complete" && verified && live && manager?.readyState === "READY" && manager.projectId === p.adminProjectId &&
      manager.meta?.gtmComponentDigest === config.component.digest && manager.meta?.gtmSourceCommit === config.component.sourceCommit &&
      managerId === verified.deploymentId && runtime.deploymentId === verified.runtimeDeploymentId && runtime.commit === verified.runtimeCommit;
    return { status: ready ? "production_ready" : "verification_required", projectId: p.projectId, adminProjectId: p.adminProjectId,
      sourceIsolated: true, databaseIsolated: true, secretStorageVerified: true, grantVerified: true, shareExcluded: true,
      deploymentId: managerId ?? null, runtimeDeploymentId: runtime.deploymentId };
  } finally { journal.close(); }
}
