import { spawnSync } from "node:child_process";
import { requireThat, ConnectionError } from "../src/errors.mjs";
export function captured(command, args, { input, cwd } = {}) {
  const result = spawnSync(command, args, { input, cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 && command === "vercel" && args[0] === "api" && args[1] === "/v3/user/tokens" && /Cannot create tokens for this app/.test(result.stderr ?? ""))
    throw new ConnectionError("project_token_dashboard_required", 409);
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
