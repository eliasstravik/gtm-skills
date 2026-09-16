import { providerVariable } from "../dist/catalog.mjs";
import { ConnectionError, requireThat } from "./errors.mjs";
import { runtimeSnapshot } from "./snapshot.mjs";
export const INTEGRATION_SCOPES = ["read:integration-configuration", "read:deployment", "read:project", "read-write:global-project-env-vars", "read:team"].sort();
export function validateInstallation(grant, fixed) {
  requireThat(grant && grant.id === fixed.installationId && grant.integrationId === fixed.integrationId && grant.teamId === fixed.teamId &&
    typeof grant.userId === "string" && grant.userId.length > 0 && (!fixed.ownerId || grant.userId === fixed.ownerId) &&
    Array.isArray(grant.projects) && grant.projects.length === 1 && grant.projects[0] === fixed.projectId &&
    (grant.projectSelection === undefined || grant.projectSelection === "selected") &&
    Array.isArray(grant.scopes) && JSON.stringify([...grant.scopes].sort()) === JSON.stringify(INTEGRATION_SCOPES) &&
    !grant.disabledAt && !grant.deletedAt && !grant.deleteRequestedAt &&
    (grant.status === undefined || grant.status === "ready"), "installation_denied", 403);
}
export async function boundedResponse(response, limit = 2 * 1024 * 1024) {
  const reader = response.body?.getReader(); requireThat(reader, "upstream_unavailable", 503);
  const chunks = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      requireThat(size <= limit, "upstream_too_large", 503); chunks.push(value); }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch { throw new ConnectionError("upstream_unavailable", 503); }
  finally { await reader.cancel(); }
}
export function vercelTransport({ token, teamId, fetcher = fetch }) {
  return async (method, path, body) => {
    requireThat(path.startsWith("/") && !path.startsWith("//"), "invalid_api_path");
    const url = new URL(path, "https://api.vercel.com"); url.searchParams.set("teamId", teamId);
    let response;
    try { response = await fetcher(url, { method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
    catch { throw new ConnectionError("vercel_outcome_unknown", 503); }
    if (!response.ok) { await response.body?.cancel(); throw new ConnectionError("vercel_request_denied", response.status >= 500 ? 503 : response.status); }
    return boundedResponse(response);
  };
}
export async function currentMember(api, teamId, subject) {
  const seen = new Set(); let cursor, found;
  for (let page = 0; page < 100; page++) {
    const result = await api("GET", `/v2/teams/${encodeURIComponent(teamId)}/members?limit=100${cursor === undefined ? "" : `&until=${encodeURIComponent(cursor)}`}`);
    requireThat(Array.isArray(result.members) && result.pagination && typeof result.pagination === "object", "membership_unavailable", 403);
    for (const member of result.members) {
      requireThat(typeof member.uid === "string" && typeof member.confirmed === "boolean" && typeof member.role === "string", "membership_unavailable", 403);
      if (member.uid === subject) { requireThat(!found, "membership_unavailable", 403); found = member; }
    }
    const next = result.pagination.next;
    if (next === null && result.pagination.hasNext !== true) {
      requireThat(found?.confirmed === true && ["OWNER", "MEMBER", "DEVELOPER", "VIEWER", "BILLING"].includes(found.role), "membership_denied", 403);
      return { actor: subject, role: found.role, write: ["OWNER", "MEMBER"].includes(found.role) };
    }
    requireThat((typeof next === "number" && Number.isFinite(next) || typeof next === "string" && next.length > 0) && !seen.has(String(next)) && result.pagination.hasNext !== false, "membership_unavailable", 403);
    cursor = next; seen.add(String(next));
  }
  throw new ConnectionError("membership_unavailable", 403);
}
export function hostedAuthority(api, fixed) {
  return async (subject) => {
    const grant = await api("GET", `/v1/integrations/configuration/${encodeURIComponent(fixed.installationId)}`);
    validateInstallation(grant, fixed);
    const project = await api("GET", `/v9/projects/${encodeURIComponent(fixed.projectId)}`);
    requireThat(project.id === fixed.projectId && project.accountId === fixed.teamId, "project_denied", 403);
    return currentMember(api, fixed.teamId, subject);
  };
}
export function envMetadata(raw) {
  requireThat(raw && typeof raw.id === "string" && typeof raw.key === "string" && Array.isArray(raw.target), "invalid_environment_metadata", 503);
  // Value-bearing fields are deliberately not spread, logged or persisted.
  return { id: raw.id, variable: raw.key, type: raw.type, visibility: raw.visibility,
    targets: raw.target.filter((target) => typeof target === "string"), updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : null,
    shared: Boolean(raw.configurationId || raw.integrationId || raw.sharedEnvVariableId || raw.system),
    comment: typeof raw.comment === "string" ? raw.comment.slice(0, 500) : "" };
}
const editable = (row) => !row.shared && row.targets.length === 1 && row.targets[0] === "production" && row.updatedAt !== null;
export function vercelStorage(api, fixed) {
  let metadata = new Map();
  return {
    async list() {
      const result = await api("GET", `/v10/projects/${encodeURIComponent(fixed.projectId)}/env?decrypt=false`);
      requireThat(Array.isArray(result.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
      const rows = result.envs.filter((raw) => providerVariable(raw.key)).map(envMetadata).filter((row) => row.targets.includes("production"));
      metadata = new Map(rows.map((row) => [row.variable, row]));
      const counts = new Map(); for (const row of rows) counts.set(row.variable, (counts.get(row.variable) ?? 0) + 1);
      return rows.map((row) => ({ variable: row.variable, version: `${row.id}:${row.updatedAt}`, state: "saved", editable: editable(row) && counts.get(row.variable) === 1 }));
    },
    async write(input, prior) {
      const row = metadata.get(input.variable);
      requireThat((row ? `${row.id}:${row.updatedAt}` : "absent") === input.version, "connection_changed", 409);
      requireThat(!row || editable(row), "use_vercel_settings", 409);
      const base = `/v9/projects/${encodeURIComponent(fixed.projectId)}/env/`;
      if (input.action === "disconnect") {
        if (row) await api("DELETE", base + encodeURIComponent(row.id));
        return "absent";
      }
      const comment = `${(row?.comment ?? "").replace(/\s*\[gtm-operation:[0-9a-f-]+\]/g, "").slice(0, 400)} [gtm-operation:${input.id}]`.trim();
      const body = { value: input.value, type: "sensitive", visibility: "secret", target: ["production"], comment };
      const result = row
        ? await api("PATCH", base + encodeURIComponent(row.id), body)
        : await api("POST", `/v10/projects/${encodeURIComponent(fixed.projectId)}/env`, { ...body, key: input.variable });
      const created = result.created ?? result;
      const saved = envMetadata(Array.isArray(created) ? created[0] : created);
      requireThat(saved.variable === input.variable && saved.type === "sensitive" && saved.visibility === "secret" && editable(saved) && saved.comment === comment, "save_metadata_unavailable", 503);
      return `${saved.id}:${saved.updatedAt}`;
    },
  };
}
export function activeReader({ origin, projectId, readSecret, bypass, api, fetcher = fetch }) {
  const url = new URL("/api/connections", origin);
  requireThat(url.origin === origin && url.protocol === "https:", "invalid_runtime_origin");
  return async () => {
    const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(10000), cache: "no-store",
      headers: { authorization: `Bearer ${readSecret}`, "x-vercel-protection-bypass": bypass } });
    requireThat(response.ok, "runtime_unavailable", 503);
    const snapshot = runtimeSnapshot(await boundedResponse(response));
    requireThat(snapshot.version === 1 && snapshot.workspace === projectId && snapshot.environment === "production" && typeof snapshot.deploymentId === "string", "runtime_identity_mismatch", 503);
    const deployment = await api("GET", `/v13/deployments/${encodeURIComponent(snapshot.deploymentId)}`);
    requireThat(deployment.projectId === projectId && deployment.target === "production" && deployment.readyState === "READY", "runtime_identity_mismatch", 503);
    return { ...snapshot, deploymentCreatedAt: deployment.createdAt ?? deployment.created };
  };
}
