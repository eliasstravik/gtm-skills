import { insist } from "./connections-access";

type Api = (method: string, path: string, body?: unknown) => Promise<any>;
export type Application = { state: "idle" | "applying" | "applied" | "failed" | "unknown"; id?: string };
const pending = new Set(["QUEUED", "INITIALIZING", "BUILDING"]);
export function applicationId(id: unknown): asserts id is string {
  insist(typeof id === "string" && /^[a-f0-9-]{36}$/.test(id), "invalid_change", 400);
}
/** Only safe deployment metadata leaves this module. Never return project/env objects. */
export async function connectionDeployment(api: Api, projectId: string, origin: string) {
  const [project, result, alias] = await Promise.all([
    api("GET", `/v9/projects/${encodeURIComponent(projectId)}`),
    api("GET", `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=1`),
    api("GET", `/v4/aliases/${encodeURIComponent(new URL(origin).hostname)}`),
  ]);
  insist(project.id === projectId && typeof project.name === "string" && Array.isArray(result.deployments), "application_unavailable", 503);
  // targets.production can already point at a BUILDING or failed deployment.
  // The canonical alias identifies the code that is actually serving users.
  const current = alias.deployment;
  insist(alias.projectId === projectId && typeof current?.id === "string", "application_unavailable", 503);
  const latest = result.deployments[0];
  const id = latest?.meta?.gtmConnectionsChange;
  const state: Application["state"] = pending.has(latest?.state) ? "applying" :
    !id ? "idle" : latest?.state === "READY" && latest.uid === current.id ? "applied" : "failed";
  return { projectName: project.name, source: current.id, application: { state, ...(typeof id === "string" ? { id } : {}) } as Application };
}
/** Rebuild the serving production code with current project env; never pull a newer commit. */
export async function applyConnections(api: Api, projectId: string, id: string, origin: string): Promise<Application> {
  applicationId(id);
  try {
    const deployment = await connectionDeployment(api, projectId, origin);
    const active = deployment.application;
    // A retry reuses its build. A later saved key needs a fresh environment snapshot.
    if (active.id === id && ["applying", "applied"].includes(active.state)) return active;
    const result = await api("POST", "/v13/deployments?forceNew=1", {
      name: deployment.projectName, project: projectId, deploymentId: deployment.source,
      target: "production", withLatestCommit: false, meta: { gtmConnectionsChange: id },
    });
    insist(typeof result.id === "string", "application_unavailable", 503);
    return { id, state: ["ERROR", "CANCELED"].includes(result.readyState) ? "failed" : "applying" };
  } catch {
    // The key is already saved. Retry only the deployment, never the secret mutation.
    return { id, state: "failed" };
  }
}
