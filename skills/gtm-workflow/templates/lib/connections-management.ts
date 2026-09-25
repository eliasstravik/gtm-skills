import { connectionInventory, providerVariable, connectionLabel, credentialVariable, managedList, MANAGED_CONNECTIONS, type ConnectionWorkflow } from "./connections-contract";
import { connectionConfiguration, connectionHeaders, privateConnectionBrowser, ConnectionsError, insist } from "./connections-access";

import { applyConnections, applicationId, connectionDeployment } from "./connections-apply";
import { gatewayPlatformIdentity } from "./connections-platform";

type Configuration = ReturnType<typeof connectionConfiguration>;
/** managed: saved through the Connections tab, so listed and editable here. Every other project variable is left to Vercel settings. */
export type Metadata = { id: string; variable: string; version: string; editable: boolean; comment: string; managed: boolean };
type Api = (method: string, path: string, body?: unknown) => Promise<any>;

async function readJson(response: Response | Request, limit: number) {
  const reader = response.body?.getReader();
  insist(reader, "invalid_response", 503);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; insist(size <= limit, "request_too_large", 413); chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally { await reader.cancel(); }
}
export function connectionsVercel(config: Configuration, fetcher = fetch): Api {
  return async (method, path, body) => {
    const url = new URL(path, "https://api.vercel.com"); url.searchParams.set("teamId", config.teamId);
    insist(url.origin === "https://api.vercel.com", "invalid_api_path");
    let response: Response;
    try {
      response = await fetcher(url, { method, redirect: "error", signal: AbortSignal.timeout(20000),
        headers: { authorization: `Bearer ${config.token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch { throw new ConnectionsError(method === "GET" ? "vercel_unavailable" : "save_outcome_requires_review", 503); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new ConnectionsError(method !== "GET" && response.status >= 500 ? "save_outcome_requires_review" : "vercel_request_denied", 503);
    }
    if (response.status === 204) return null;
    try { return await readJson(response, 2 * 1024 * 1024); }
    catch { throw new ConnectionsError(method === "GET" ? "vercel_unavailable" : "save_outcome_requires_review", 503); }
  };
}
async function projectEnvironment(api: Api, projectId: string) {
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=false`);
  insist(Array.isArray(result.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
  // A plain variable, so its value comes back without decrypting anything.
  const markers = result.envs.filter((row: any) => row.key === MANAGED_CONNECTIONS && Array.isArray(row.target) && row.target.includes("production"));
  insist(markers.length <= 1 && markers.every((row: any) => typeof row.id === "string" && row.type === "plain" && row.target.length === 1), "use_vercel_settings", 409);
  return { envs: result.envs, marker: markers[0] ? { id: markers[0].id as string, names: managedList(markers[0].value) } : null };
}
/** Adds or removes one name in GTM_CONNECTIONS_MANAGED. Read-modify-write, like every other change here: simultaneous administrators coordinate. */
async function markManaged(api: Api, projectId: string, variable: string, managed: boolean) {
  const { marker } = await projectEnvironment(api, projectId), names = new Set(marker?.names ?? []);
  if (names.has(variable) === managed) return;
  if (managed) names.add(variable); else names.delete(variable);
  const body = { value: JSON.stringify([...names].sort()), type: "plain", target: ["production"], comment: "Keys saved through Connections" };
  await (marker ? api("PATCH", `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(marker.id)}`, body)
    : api("POST", `/v10/projects/${encodeURIComponent(projectId)}/env`, { ...body, key: MANAGED_CONNECTIONS }));
}
export async function connectionMetadata(api: Api, projectId: string): Promise<Metadata[]> {
  const result = await projectEnvironment(api, projectId), managed = new Set(result.marker?.names ?? []);
  const rows: Metadata[] = result.envs.filter((row: any) => providerVariable(row.key) && (credentialVariable(row.key) || ["sensitive", "encrypted", "secret"].includes(row.type) || row.visibility === "secret") && Array.isArray(row.target) && row.target.includes("production"))
    .map((row: any) => {
      insist(typeof row.id === "string", "invalid_environment_metadata", 503);
      return { id: row.id, variable: row.key, version: `${row.id}:${row.updatedAt ?? "unknown"}`,
        editable: !row.configurationId && !row.integrationId && !row.sharedEnvVariableId && !row.system &&
          row.target.length === 1 && typeof row.updatedAt === "number",
        comment: typeof row.comment === "string" ? row.comment.slice(0, 500) : "", managed: managed.has(row.key) };
    });
  return rows.map((row) => ({ ...row, editable: row.editable && rows.filter((other) => other.variable === row.variable).length === 1 }));
}
export async function changeConnection(api: Api, projectId: string, input: any) {
  insist(input && typeof input === "object" && providerVariable(input.variable), "invalid_provider_variable", 400);
  insist(["add", "replace", "disconnect"].includes(input.action) && typeof input.version === "string", "invalid_change", 400);
  if (input.label !== undefined) insist(connectionLabel(input.label), "invalid_label", 400);
  if (input.action === "add" || input.value !== undefined) insist(typeof input.value === "string" && input.value.trim().length > 0 && input.value.length <= 8192 && !/[\r\n\0]/.test(input.value), "invalid_key", 400);
  const rows = (await connectionMetadata(api, projectId)).filter((row) => row.variable === input.variable);
  insist(rows.length <= 1, "use_vercel_settings", 409);
  const row = rows[0];
  // A same-named variable made outside the tab (CLI, dashboard, setup script) is not this page's to change.
  insist(!row || (row.editable && row.managed), "use_vercel_settings", 409);
  insist((row?.version ?? "absent") === input.version && (input.action !== "add" || !row), "connection_changed", 409);
  insist(input.action !== "replace" || row, "connection_changed", 409);
  const requiresDeployment = input.action === "add" || input.value !== undefined || (input.action === "disconnect" && Boolean(row));
  const base = `/v9/projects/${encodeURIComponent(projectId)}/env/`;
  if (input.action === "disconnect") {
    if (row) await api("DELETE", base + encodeURIComponent(row.id));
    await markManaged(api, projectId, input.variable, false);
  } else {
    // Marked before the key exists: a failed write leaves a name without a variable, which lists nothing.
    if (!row) await markManaged(api, projectId, input.variable, true);
    const body: Record<string, any> = { ...(input.value === undefined ? {} : { value: input.value, type: "sensitive", visibility: "secret" }), target: ["production"], comment: input.label?.trim() ?? row?.comment ?? input.variable };
    try {
      await (row ? api("PATCH", base + encodeURIComponent(row.id), body) : api("POST", `/v10/projects/${encodeURIComponent(projectId)}/env`, { ...body, key: input.variable }));
    } finally { body.value = undefined; input.value = undefined; }
  }
  return { saved: true, requiresDeployment };
}
export async function changeAndApplyConnection(api: Api, projectId: string, input: any, origin: string) {
  applicationId(input?.id);
  if (input.action === "apply") return { application: await applyConnections(api, projectId, input.id, origin) };
  const result = await changeConnection(api, projectId, input);
  const application = result.requiresDeployment ? await applyConnections(api, projectId, input.id, origin) : undefined;
  return { ...result, ...(application ? { application } : {}) };
}
export async function connectionsManagement(req: Request, workflows: ConnectionWorkflow[], operation = "inventory") {
  try {
    const config = connectionConfiguration();
    const session = await privateConnectionBrowser(req, config);
    insist(["GET", "POST"].includes(req.method), "method_not_allowed", 405);
    if (operation === "session") {
      insist(req.method === "GET", "method_not_allowed", 405);
      return Response.json(session, { headers: connectionHeaders });
    }
    const api = connectionsVercel(config);
    if (req.method === "POST") {
      const input = await readJson(req, 16384);
      const result = await changeAndApplyConnection(api, config.projectId, input, config.origin);
      return Response.json(result, { headers: connectionHeaders });
    }
    const rows = (await connectionMetadata(api, config.projectId)).filter((row) => row.managed);
    const application = await connectionDeployment(api, config.projectId, config.origin).then((result) => result.application).catch(() => ({ state: "unknown" }));
    return Response.json({ mode: "production", canWrite: true, application,
      workflowsUrl: `${config.origin}/viewer`, vercelUrl: environmentSettingsUrl(),
      connections: connectionInventory(rows.map((row) => row.variable), workflows, gatewayPlatformIdentity(), Object.fromEntries(rows.map((row) => [row.variable, row.comment]))).map((entry) => ({
        ...entry, status: entry.platformIdentity ? "Provided by Vercel" : "Saved",
        fields: entry.fields.map((field) => { const row = rows.find((row) => row.variable === field.variable)!;
          return { variable: row.variable, label: row.comment, version: row.version, editable: row.editable, state: "saved" }; }),
      })),
    }, { headers: connectionHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof ConnectionsError ? error.code : "connections_unavailable" },
      { status: error instanceof ConnectionsError ? error.status : 503, headers: connectionHeaders });
  }
}

export function environmentSettingsUrl(env = process.env) {
  try {
    const url = new URL(env.GTM_CONNECTIONS_VERCEL_URL ?? "");
    return url.origin === "https://vercel.com" && !url.username && !url.password &&
      /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/settings\/environment-variables$/.test(url.pathname) && !url.search && !url.hash ? url.href : undefined;
  } catch { return undefined; }
}
