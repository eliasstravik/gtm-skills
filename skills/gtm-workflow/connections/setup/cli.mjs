import { spawnSync } from "node:child_process";
import { requireThat, ConnectionError } from "../src/errors.mjs";
export function captured(command, args, { input, cwd } = {}) {
  const result = spawnSync(command, args, { input, cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 && command === "vercel" && args[0] === "integration" && args[1] === "add" &&
    /accept-terms|terms[^\n]{0,100}accept/i.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`))
    throw new ConnectionError("marketplace_terms_required", 409);
  requireThat(result.status === 0, `${command.replace(/[^a-z0-9]/gi, "_")}_command_failed`, 503);
  return result.stdout;
}
export function ownerApi(team) {
  return async (method, path, body) => {
    const args = ["api", path, "--method", method, "--raw", "--non-interactive", "--scope", team, ...(body === undefined ? [] : ["--input", "-"])];
    const output = captured("vercel", args, { input: body === undefined ? undefined : JSON.stringify(body) });
    try { return JSON.parse(output); } catch { throw new ConnectionError("invalid_vercel_response", 503); }
  };
}
export async function safeEnvironment(api, projectId) {
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=false`);
  requireThat(Array.isArray(result.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
  return result.envs.map((row) => ({ id: row.id, key: row.key, target: row.target, type: row.type, visibility: row.visibility, updatedAt: row.updatedAt, comment: row.comment }));
}
const configurationKeys = new Set(["CONNECTIONS_CLIENT_ID", "CONNECTIONS_INSTALLATION_ID", "CONNECTIONS_INTEGRATION_ID", "CONNECTIONS_COMPONENT_DIGEST",
  "CONNECTIONS_TEAM_ID", "CONNECTIONS_PROJECT_ID", "CONNECTIONS_TEAM_SLUG", "CONNECTIONS_PROJECT_NAME", "CONNECTIONS_ORIGIN", "CONNECTIONS_RUNTIME_ORIGIN",
  "GTM_VIEWER_PRIVATE_ORIGIN", "GTM_VIEWER_PRIVATE_PROJECT_ID", "GTM_VIEWER_PROTECTED", "GTM_VIEWER_SHARE_ORIGIN", "GTM_CONNECTIONS_ORIGIN",
  "GTM_WORKFLOW_GATE_REQUIRED", "GTM_WORKFLOW_URL", "GTM_AGENT_URL", "TURSO_DATABASE_URL"]);
export async function configurationValue(api, projectId, key) {
  requireThat(configurationKeys.has(key), "secret_read_denied", 403);
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=false`);
  requireThat(Array.isArray(result.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
  const rows = result.envs.filter((row) => row.key === key && row.target?.includes("production"));
  requireThat(rows.length === 1 && rows[0].visibility === "config" && ["plain", "encrypted"].includes(rows[0].type) && rows[0].target.length === 1, "configuration_value_unverified", 409);
  // Legacy CLI --no-sensitive settings are encrypted Config variables. Read
  // only the allowlisted nonsecret binding, never a Secret or provider key.
  const row = rows[0].type === "plain" ? rows[0] : await api("GET", `/v1/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(rows[0].id)}`);
  requireThat(row.id === rows[0].id && row.key === key && row.visibility === "config" && typeof row.value === "string", "configuration_value_unverified", 409);
  return row.value;
}
export async function setConfiguration(api, projectId, key, value, { secret = true, replace = false, comment } = {}) {
  const rows = (await safeEnvironment(api, projectId)).filter((row) => row.key === key && row.target?.includes("production"));
  requireThat(rows.length <= 1, "ambiguous_existing_configuration", 409);
  const prior = rows[0]; if (prior && !replace) return { state: "existing", id: prior.id };
  requireThat(!prior || prior.target.length === 1, "configuration_has_multiple_targets", 409);
  const body = { value, target: ["production"], type: secret ? "sensitive" : "plain", visibility: secret ? "secret" : "config", ...(comment ? { comment } : {}) };
  const result = prior ? await api("PATCH", `/v9/projects/${projectId}/env/${prior.id}`, body) : await api("POST", `/v10/projects/${projectId}/env`, { ...body, key });
  const raw = result.created ?? result, row = Array.isArray(raw) ? raw[0] : raw;
  requireThat(row?.id && (!secret || row.visibility === "secret"), "configuration_write_unknown", 503);
  return { state: "saved", id: row.id, updatedAt: row.updatedAt, comment: row.comment };
}
export async function cliCapabilities() {
  // Some versions write help to stderr; capture a dedicated bounded probe instead.
  const probe = (args) => { const r = spawnSync(args[0], args.slice(1), { encoding: "utf8", stdio: "pipe", maxBuffer: 1024 * 1024 }); return { ok: r.status === 0, help: r.stdout + r.stderr }; };
  const current = probe(["vercel", "--help"]);
  const tested = /\boauth-apps\b/.test(current.help) ? current : probe(["npm", "exec", "--yes", "--package=vercel@59.19.0", "--", "vercel", "--help"]);
  return { identityRegistrationCli: tested.ok && /^\s+oauth-apps\s/m.test(tested.help), integrationRegistrationCli: false, testedCli: "59.19.0" };
}
