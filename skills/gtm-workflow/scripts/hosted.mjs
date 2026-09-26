// The deployed copy's one-time configuration, through the owner's own Vercel CLI login: the production Keys page's
// project token and settings, and the checks Doctor runs. Creates no projects or databases.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

export class SetupError extends Error {
  constructor(code, status = 400, instruction) { super(code); this.name = "SetupError"; this.code = code; this.status = status; this.instruction = instruction; }
}
export const requireThat = (condition, code, status = 409, instruction) => { if (!condition) throw new SetupError(code, status, instruction); };
export const safeError = (error) => error?.name === "SetupError" ? { error: error.code, status: error.status, ...(error.instruction ? { instruction: error.instruction } : {}) } : { error: "setup_failed", status: 503, message: String(error?.message ?? error).slice(0, 300) };

/** `vercel api` as the signed-in owner; the body goes on stdin, never on the command line. */
export function ownerApi(team) {
  return async (method, path, body) => {
    const result = spawnSync("vercel", ["api", path, "--method", method, "--raw", "--non-interactive", "--scope", team, ...(body === undefined ? [] : ["--input", "-"])],
      { input: body === undefined ? undefined : JSON.stringify(body), encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0 && path === "/v3/user/tokens" && /Cannot create tokens for this app/.test(result.stderr ?? "")) throw new SetupError("project_token_dashboard_required", 409);
    requireThat(result.status === 0, "vercel_command_failed", 503, "Sign in with `vercel login` as a member of the team, then run this again.");
    const out = result.stdout.split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n");
    try { return JSON.parse(out); } catch { throw new SetupError("invalid_vercel_response", 503); }
  };
}
/** Names, targets and types only: never values. */
export async function safeEnvironment(api, projectId) {
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=false`);
  requireThat(Array.isArray(result.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
  return result.envs.map((row) => ({ id: row.id, key: row.key, target: row.target, type: row.type, visibility: row.visibility }));
}
async function setProduction(api, projectId, key, value, { secret }) {
  const rows = (await safeEnvironment(api, projectId)).filter((row) => row.key === key && row.target?.includes("production"));
  requireThat(rows.length <= 1 && (!rows[0] || rows[0].target.length === 1), "ambiguous_existing_configuration", 409);
  const body = { value, target: ["production"], type: secret ? "sensitive" : "plain" };
  if (rows[0]) await api("PATCH", `/v9/projects/${projectId}/env/${rows[0].id}`, body);
  else await api("POST", `/v10/projects/${projectId}/env`, { ...body, key });
}

/** The Vercel project this workspace's `workflows/` is linked to, or the one named on the command line. */
export function workflowProject(workspace, { team, project } = {}) {
  const file = join(workspace, "workflows", ".vercel", "project.json");
  const linked = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  return { team: team ?? linked?.orgId, project: project ?? linked?.projectId, linked: Boolean(linked) };
}

/** Vercel Authentication on every deployment is what keeps the private runtime private; nothing is configured without it. */
export function protectionProblems(project) {
  const problems = [];
  if (project.ssoProtection?.deploymentType !== "all") problems.push("protect_all_deployments_first");
  if (Object.values(project.protectionBypass ?? {}).some((entry) => entry.scope !== "automation-bypass")) problems.push("remove_deployment_share_links_first");
  return problems;
}

export async function setupHosted({ team, project: name }) {
  requireThat(typeof team === "string" && /^[a-zA-Z0-9_-]+$/.test(team), "team_required", 400, "Pass --team <team slug>, or link workflows/ with `vercel link`.");
  requireThat(typeof name === "string" && /^[a-zA-Z0-9_-]+$/.test(name), "existing_workflow_project_required", 400, "Pass --workflow-project <gtm-ws>.");
  const api = ownerApi(team), project = await api("GET", `/v9/projects/${encodeURIComponent(name)}`);
  requireThat(project?.id && project.accountId && /^[a-z0-9-]+$/.test(project.name), "workflow_project_required", 409);
  const [problem] = protectionProblems(project);
  requireThat(!problem, problem, 409, "In the project's Settings > Deployment Protection, turn on Vercel Authentication for All Deployments and remove shareable links.");
  const teamSlug = team.startsWith("team_") ? (await api("GET", `/v2/teams/${project.accountId}`)).slug : team;
  const origin = `https://${project.name}.vercel.app`;
  const env = await safeEnvironment(api, project.id);
  const existing = env.filter((row) => row.key === "GTM_CONNECTIONS_VERCEL_TOKEN" && row.target?.includes("production"));
  requireThat(existing.length <= 1 && existing.every((row) => row.type === "sensitive" && row.target.length === 1), "connections_token_configuration_conflict", 409);
  // The production Keys page's own token, scoped to this project. Created and stored in one go; if storing fails, the
  // next run makes another and the unused one can be revoked under Account Settings > Tokens.
  if (!existing.length) {
    const grant = await api("POST", "/v3/user/tokens", { name: `Keys page for ${project.name}`, projectId: project.id });
    requireThat(typeof grant.bearerToken === "string" && grant.bearerToken.length > 0 && grant.token?.projectId === project.id, "project_token_creation_failed", 503);
    await setProduction(api, project.id, "GTM_CONNECTIONS_VERCEL_TOKEN", grant.bearerToken, { secret: true });
  }
  // GTM_VIEWER_PROTECTED says Vercel Authentication was verified on all deployments (checked above): the private routes
  // trust any request that reached them only when it is set.
  for (const [key, value] of Object.entries({ GTM_VIEWER_PROTECTED: "1", GTM_CONNECTIONS_VERCEL_URL: `https://vercel.com/${teamSlug}/${project.name}/settings/environment-variables`, GTM_CONNECTIONS_ORIGIN: origin, GTM_CONNECTIONS_TEAM_ID: project.accountId, GTM_CONNECTIONS_ENABLED: "1" }))
    await setProduction(api, project.id, key, value, { secret: false });
  return { status: "deployment_required", projectId: project.id, workflowName: project.name, connectionsUrl: `${origin}/connections`,
    instruction: "Deploy the workflow runtime to Production (push to main), then open the Keys page through your normal Vercel session." };
}

export async function doctorHosted({ team, project: name }) {
  requireThat(team && name, "run_hosted_setup", 409, "Pass --team and --workflow-project, or link workflows/ with `vercel link`.");
  const api = ownerApi(team), project = await api("GET", `/v9/projects/${encodeURIComponent(name)}`);
  const problems = protectionProblems(project);
  const env = await safeEnvironment(api, project.id);
  if (project.previewDeploymentsDisabled !== true) problems.push("turn_off_preview_deployments");
  const missing = ["GTM_VIEWER_PROTECTED", "GTM_CONNECTIONS_VERCEL_TOKEN", "GTM_CONNECTIONS_VERCEL_URL", "GTM_CONNECTIONS_ORIGIN", "GTM_CONNECTIONS_TEAM_ID", "GTM_CONNECTIONS_ENABLED"]
    .filter((key) => !env.some((row) => row.key === key && row.target?.includes("production")));
  return { status: problems.length ? problems[0] : missing.length ? "setup_needed" : "production_ready", workflowName: project.name, missing,
    connectionsUrl: `https://${project.name}.vercel.app/connections` };
}

const DATABASE_VARIABLE = /^(?:DATABASE_URL|POSTGRES_|PG)/;
const localKey = (name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !/^(?:GTM|VERCEL|NEXT|DATABASE|POSTGRES|PG|NEON|CRON|WORKFLOW|NODE|NPM)_?/i.test(name) && /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name);
/**
 * `vercel link` in workflows/, where the Vercel app lives, so `vercel env pull`, `vercel curl` and `workflow inspect
 * --backend vercel` work there. Before the first pull can happen: refuse when the Development environment holds a
 * database (the Neon integration ticks Development by default), and add keys saved only in `.env.local` to
 * Development, so a later pull brings them back instead of dropping them.
 */
export function linkWorkflows(workspace, { team, project }) {
  const runtime = join(workspace, "workflows");
  if (existsSync(join(runtime, ".vercel", "project.json"))) return { linked: "already" };
  const cli = (args, input) => spawnSync("vercel", [...args, "--non-interactive", "--scope", team], { cwd: runtime, input, encoding: "utf8", stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
  const listed = cli(["env", "ls", "development", "--project", project, "--format", "json"]);
  requireThat(listed.status === 0, "vercel_command_failed", 503, "Sign in with `vercel login` as a member of the team, then run this again.");
  const development = new Set(JSON.parse(listed.stdout.split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n")).envs.map((row) => row.key));
  requireThat(![...development].some((name) => DATABASE_VARIABLE.test(name)), "production_database_in_development", 409,
    "The project's Development environment holds a database. In Vercel, open the Neon integration's settings and untick Development for the production database, then run setup again. A Neon development branch connected to Development on purpose: run `vercel link` in workflows/ yourself.");
  const file = join(runtime, ".env.local"), local = existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
  const added = [];
  for (const [name, value] of Object.entries(local)) {
    if (!localKey(name) || development.has(name) || !value?.trim()) continue;
    requireThat(cli(["env", "add", name, "development", "--project", project, "--no-sensitive", "--yes"], value).status === 0, "vercel_command_failed", 503);
    added.push(name);
  }
  requireThat(cli(["link", "--yes", "--project", project]).status === 0, "vercel_link_failed", 503);
  return { linked: "now", addedToDevelopment: added };
}

/** Runs a CLI and returns its JSON output, or null when it fails. */
const json = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) return null;
  try { return JSON.parse(result.stdout.split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n")); } catch { return null; }
};
/**
 * For copy-down (`npm run db:pull`) and imports: which Neon organization and project hold production's database. The
 * production marker names its endpoint (read through the linked project with `vercel curl`); the owner's `neonctl`
 * login finds the project with that endpoint, reading metadata only. Saved, without secrets, in the gitignored
 * `workflows/data/neon.json`. Null when either tool cannot answer (then copy-down and local imports are unavailable).
 */
export function saveNeonProject(workspace) {
  const runtime = join(workspace, "workflows");
  const reply = json("vercel", ["curl", "/api/query", "--non-interactive", "--", "-sS", "-X", "POST", "-H", "content-type: application/json", "-d", JSON.stringify({ sql: "select endpoint from gtm.environment where name = 'production'" })], runtime);
  const endpoint = reply?.rows?.[0]?.endpoint;
  if (typeof endpoint !== "string" || !/^ep-[a-z0-9-]+$/.test(endpoint)) return { status: "production_endpoint_unknown" };
  for (const org of json("neonctl", ["orgs", "list", "--output", "json"]) ?? []) {
    const listed = json("neonctl", ["projects", "list", "--org-id", org.id, "--output", "json"]);
    for (const project of (Array.isArray(listed) ? listed : listed?.projects) ?? []) {
      const endpoints = json("neonctl", ["api", `/projects/${project.id}/endpoints`])?.endpoints ?? [];
      if (!endpoints.some((row) => row.id === endpoint)) continue;
      const neon = { orgId: org.id, projectId: project.id, endpoint };
      mkdirSync(join(runtime, "data"), { recursive: true });
      writeFileSync(join(runtime, "data", "neon.json"), JSON.stringify(neon, null, 2) + "\n");
      return { status: "saved", ...neon };
    }
  }
  return { status: "neon_project_not_found", endpoint, instruction: "Sign in with `neonctl auth` as a member of the Neon organization Vercel made for this team, then run setup --deploy again." };
}
