import { workspaceState, privateJson, writePrivateJson } from "../local/state.mjs";
import { nativeStore } from "../local/storage.mjs";
import { requireThat } from "../src/errors.mjs";
import { ownerApi, safeEnvironment, setConfiguration } from "./cli.mjs";
import { setupLock } from "./lock.mjs";

/** Connections is part of an existing protected workflow project. No resource provisioning. */
export async function configurePrivateProject({ api, project, store }) {
  requireThat(project?.id && project.accountId && /^[a-z0-9-]+$/.test(project.name), "workflow_project_required", 409);
  requireThat(project.ssoProtection?.deploymentType === "all", "protect_all_deployments_first", 409);
  requireThat(!Object.values(project.protectionBypass ?? {}).some((entry) => entry.scope !== "automation-bypass"), "remove_deployment_share_links_first", 409);
  const origin = `https://${project.name}.vercel.app`;
  const env = await safeEnvironment(api, project.id);
  const existing = env.filter((row) => row.key === "GTM_CONNECTIONS_VERCEL_TOKEN" && row.target?.includes("production"));
  requireThat(existing.length <= 1 && existing.every((row) => row.type === "sensitive" && row.visibility === "secret" && row.target.length === 1), "connections_token_configuration_conflict", 409);
  if (!existing.length) {
    const stagingKey = `PRIVATE_PROJECT_TOKEN_${project.id}`;
    let token = store.loadForRuntime(stagingKey);
    if (!token) {
      const grant = await api("POST", "/v3/user/tokens", { name: `Connections for ${project.name}`, projectId: project.id });
      requireThat(typeof grant.bearerToken === "string" && grant.bearerToken.length > 0 && grant.token?.projectId === project.id, "project_token_creation_failed", 503);
      token = grant.bearerToken;
      store.set(stagingKey, token);
    }
    await setConfiguration(api, project.id, "GTM_CONNECTIONS_VERCEL_TOKEN", token);
  }
  for (const [key, value] of Object.entries({ GTM_CONNECTIONS_ORIGIN: origin, GTM_CONNECTIONS_TEAM_ID: project.accountId, GTM_CONNECTIONS_ENABLED: "1" }))
    await setConfiguration(api, project.id, key, value, { secret: false, replace: true });
  return { mode: "private-project", teamId: project.accountId, projectId: project.id, workflowName: project.name, origin, runtimeOrigin: origin };
}
export async function setupHosted({ workspace, team, workflowProject }) {
  requireThat(typeof team === "string" && /^[a-z0-9-]+$/.test(team), "team_required");
  const state = await workspaceState(workspace), release = await setupLock(state);
  try {
    const config = await privateJson(state.configPath, {});
    const name = workflowProject ?? config.production?.workflowName;
    requireThat(typeof name === "string" && /^[a-zA-Z0-9_-]+$/.test(name), "existing_workflow_project_required", 409);
    const api = ownerApi(team), project = await api("GET", `/v9/projects/${encodeURIComponent(name)}`);
    requireThat(!config.production?.projectId || config.production.projectId === project.id, "production_binding_changed", 409);
    const production = await configurePrivateProject({ api, project, store: nativeStore(`${state.id}/setup`) });
    await writePrivateJson(state.configPath, { ...config, production: { ...config.production, ...production, team } });
    return { status: "deployment_required", projectId: project.id, connectionsUrl: `${production.origin}/connections`,
      instruction: "Deploy the updated workflow runtime to Production, then open Connections through your normal Vercel session." };
  } catch (error) {
    if (error.code !== "project_token_dashboard_required") throw error;
    return { status: "human_step", stage: "project_token", settings: "https://vercel.com/account/settings/tokens",
      instruction: "Create a token scoped only to the existing workflow project. Save it directly as that project's Production Secret GTM_CONNECTIONS_VERCEL_TOKEN, then resume setup. Never paste it in chat." };
  } finally { await release(); }
}
export async function doctorHosted(_state, config) {
  const p = config.production;
  requireThat(p?.mode === "private-project", "run_hosted_setup", 409);
  const api = ownerApi(p.team), project = await api("GET", `/v9/projects/${encodeURIComponent(p.projectId)}`);
  requireThat(project.id === p.projectId && project.accountId === p.teamId && project.ssoProtection?.deploymentType === "all", "protect_all_deployments_first", 409);
  const env = await safeEnvironment(api, p.projectId);
  const present = ["GTM_CONNECTIONS_VERCEL_TOKEN", "GTM_CONNECTIONS_ORIGIN", "GTM_CONNECTIONS_TEAM_ID", "GTM_CONNECTIONS_ENABLED"].every((key) => env.some((row) => row.key === key && row.target?.includes("production")));
  return { status: present ? "browser_verification_required" : "setup_needed", connectionsUrl: `${p.origin}/connections`,
    instruction: "Open Connections in your signed-in browser to verify deployed access and key metadata. Configuration alone does not prove the deployment is current." };
}
