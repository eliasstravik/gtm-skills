// Going live, and checking production, through the owner's own git, gh and vercel logins: the GitHub repository, the
// Vercel project `gtm-<ws>` and its settings, the link in workflows/, Neon from the Vercel marketplace (Production only),
// the secrets production needs, one automation bypass, the public share project, optionally the GTM agent's wiring,
// the first push of workflows/, and a production deployment. Every step checks what exists first, so running it again
// (after a fix, or on a live workspace) does only what is missing. Doctor checks the same list without changing it.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { applyShareFirewall, shareFirewallDrift } from "./share-firewall.mjs";

export class SetupError extends Error {
  constructor(code, status = 400, instruction) { super(code); this.name = "SetupError"; this.code = code; this.status = status; this.instruction = instruction; }
}
export const requireThat = (condition, code, status = 409, instruction) => { if (!condition) throw new SetupError(code, status, instruction); };
export const safeError = (error) => error?.name === "SetupError" ? { error: error.code, status: error.status, ...(error.instruction ? { instruction: error.instruction } : {}) } : { error: "setup_failed", status: 503, message: String(error?.message ?? error).slice(0, 300) };

// The Vercel CLI may print a hint line for agents before its output.
const clean = (text) => (text ?? "").split("\n").filter((line) => !line.startsWith("<claude-code-hint")).join("\n").trim();
const exec = (command, args, { cwd, input } = {}) => spawnSync(command, args, { cwd, input, encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024 });
const random = (bytes) => randomBytes(bytes).toString("hex");

/** `vercel api` as the signed-in owner; the body goes on stdin, never on the command line. A GET of something missing is null. */
export function ownerApi(team) {
  return async (method, path, body) => {
    const result = exec("vercel", ["api", path, "--method", method, "--raw", "--non-interactive", "--scope", team, ...(body === undefined ? [] : ["--input", "-"])],
      { input: body === undefined ? undefined : JSON.stringify(body) });
    if (result.status !== 0 && method === "GET" && /\(404\)/.test(result.stderr ?? "")) return null;
    if (result.status !== 0 && path === "/v3/user/tokens" && /Cannot create tokens for this app/.test(result.stderr ?? "")) throw new SetupError("project_token_dashboard_required", 409,
      "Create a token on vercel.com under Account Settings > Tokens, scoped to this team and only this project, save it as the project's Production secret GTM_CONNECTIONS_VERCEL_TOKEN, then run setup again.");
    requireThat(result.status === 0, "vercel_command_failed", 503, `vercel api ${method} ${path.split("?")[0]}: ${clean(result.stderr).split("\n").at(-1)?.slice(0, 200) || "failed"}. Signed in with \`vercel login\` as a member of the team?`);
    const out = clean(result.stdout);
    try { return out ? JSON.parse(out) : {}; } catch { requireThat(method !== "GET", "invalid_vercel_response", 503); return {}; }
  };
}

// Settings the scripts write and compare, as plain variables whose values Vercel returns; every other variable is names only.
const SETTINGS = new Set(["GTM_VIEWER_PROTECTED", "GTM_CONNECTIONS_ENABLED", "GTM_CONNECTIONS_TEAM_ID", "GTM_CONNECTIONS_VERCEL_URL",
  "GTM_VIEWER_SHARE_ORIGIN", "GTM_VIEWER_PRIVATE_ORIGIN", "GTM_VIEWER_PRIVATE_PROJECT_ID", "GTM_AGENT_URL", "GTM_WORKFLOW_URL"]);
/** A project's variables: names, targets, types and update times; values only for the plain settings above. */
export async function safeEnvironment(api, projectId) {
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env`);
  requireThat(Array.isArray(result?.envs) && !result.pagination?.next, "environment_inventory_incomplete", 503);
  return result.envs.map((row) => ({ id: row.id, key: row.key, target: row.target ?? [], type: row.type, updatedAt: row.updatedAt ?? row.createdAt ?? 0,
    ...(SETTINGS.has(row.key) && row.type === "plain" ? { value: row.value } : {}) }));
}
const production = (env, key) => env.filter((row) => row.key === key && row.target.includes("production"));
export const hasProduction = (env, key) => production(env, key).length > 0;

/**
 * Sets a Production variable and says whether anything changed. Secrets are only added when missing unless `replace`;
 * settings are compared by value and rewritten as plain text when they differ (an older non-plain copy is replaced once).
 */
async function setProduction(api, project, env, key, value, { secret = false, replace = !secret } = {}) {
  const rows = production(env, key);
  requireThat(rows.length <= 1 && (!rows[0] || rows[0].target.length === 1), "ambiguous_existing_configuration", 409,
    `${project.name} has ${key} shared with other environments or twice; keep one Production-only copy in the project's Environment Variables, then run setup again.`);
  const [row] = rows;
  if (row && (!replace || (!secret && row.type === "plain" && row.value === value))) return false;
  if (row && !secret && row.type !== "plain") {
    removeVariable(project, key, "production");
    await api("POST", `/v10/projects/${project.id}/env`, { key, value, target: ["production"], type: "plain" });
  } else if (row) await api("PATCH", `/v9/projects/${project.id}/env/${row.id}`, { value, target: ["production"], type: secret ? "sensitive" : "plain" });
  else await api("POST", `/v10/projects/${project.id}/env`, { key, value, target: ["production"], type: secret ? "sensitive" : "plain" });
  return true;
}

function removeVariable(project, key, target) {
  const result = exec("vercel", ["env", "rm", key, ...(target ? [target] : []), "--project", project.name, "--yes", "--non-interactive", "--scope", project.team]);
  requireThat(result.status === 0 || /env_not_found/.test(result.stderr + result.stdout), "vercel_command_failed", 503, `vercel env rm ${key} on ${project.name}: ${clean(result.stderr).split("\n").at(-1)?.slice(0, 200)}`);
}
/** The address Vercel serves production at, the same one the app sees as VERCEL_PROJECT_PRODUCTION_URL: the shortest custom domain, else the shortest vercel.app one. */
export async function productionOrigin(api, projectId) {
  const domains = ((await api("GET", `/v9/projects/${encodeURIComponent(projectId)}/domains`))?.domains ?? [])
    .filter((row) => !row.redirect && !row.gitBranch && !row.customEnvironmentId && row.verified !== false).map((row) => row.name)
    .sort((a, b) => a.endsWith(".vercel.app") - b.endsWith(".vercel.app") || a.length - b.length);
  return domains[0] ? `https://${domains[0]}` : null;
}

/** The Vercel project this workspace's `workflows/` is linked to, or the one named on the command line, else `gtm-<ws>` (the folder name). */
export function workflowProject(workspace, { team, project } = {}) {
  const file = join(workspace, "workflows", ".vercel", "project.json");
  const linked = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  return { team: team ?? linked?.orgId, project: project ?? linked?.projectId ?? basename(workspace), linked: linked?.projectId ?? null };
}

// What each project must look like. The runtime builds every push to main (no ignored build step), never previews,
// and sits behind Vercel Authentication on every deployment. The share project is the runtime's public companion.
export const RUNTIME_SETTINGS = { framework: "nitro", rootDirectory: "workflows", nodeVersion: "22.x", autoExposeSystemEnvs: true, previewDeploymentsDisabled: true, commandForIgnoringBuildStep: null, ssoProtection: { deploymentType: "all" } };
export const SHARE_SETTINGS = { framework: "nitro", rootDirectory: "workflows", buildCommand: "npm run build:share", nodeVersion: "22.x", autoExposeSystemEnvs: true, previewDeploymentsDisabled: true, commandForIgnoringBuildStep: null, ssoProtection: null };
const comparable = (key, value) => JSON.stringify(key === "ssoProtection" ? value?.deploymentType ?? null : value ?? null);
export const settingsPatch = (project, wanted) => Object.fromEntries(Object.entries(wanted).filter(([key, value]) => comparable(key, project[key]) !== comparable(key, value)));
// Database variables in every form the Neon integration injects, and secrets that must never reach the public share project.
export const DATABASE_VARIABLE = /^(?:DATABASE_URL|POSTGRES_|PG[A-Z])/;
// Variables of earlier designs that nothing reads any more.
const RETIRED = /^(?:GTM_RUN_SECRET|GTM_DATA_URL|GTM_RUNS_URL|GTM_CONNECTIONS_ORIGIN|GTM_CONNECTIONS_MANAGED)$/;
const PRIVATE_ONLY = /^(?:DATABASE_URL|POSTGRES_|PG[A-Z]|NEON_|CRON_SECRET$|GTM_GITHUB_TOKEN$|GTM_CONNECTIONS_VERCEL_TOKEN$|GTM_VIEWER_LINK_KEY$)/;

/** The automation bypasses on a project; the one Vercel gives deployments as VERCEL_AUTOMATION_BYPASS_SECRET comes first. Secrets never leave this module. */
const bypasses = (project) => Object.entries(project.protectionBypass ?? {}).filter(([, row]) => row.scope === "automation-bypass")
  .sort(([, a], [, b]) => Number(Boolean(b.isEnvVar)) - Number(Boolean(a.isEnvVar)) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
export const bypassSummary = (project) => { const list = bypasses(project); return { count: list.length, envVar: Boolean(list[0]?.[1].isEnvVar) }; };
/** Exactly the one bypass the app and the agent use: made when missing, marked as the env-var one when none is. Extra ones are only reported. */
async function ensureBypass(api, project) {
  let list = bypasses(project), changed = false;
  if (!list.length) { await api("PATCH", `/v1/projects/${project.id}/protection-bypass`, { generate: { note: "GTM" } }); changed = true; }
  else if (!list[0][1].isEnvVar) { await api("PATCH", `/v1/projects/${project.id}/protection-bypass`, { update: { secret: list[0][0], isEnvVar: true } }); changed = true; }
  if (changed) list = bypasses(await api("GET", `/v9/projects/${project.id}`));
  requireThat(list[0]?.[1].isEnvVar, "bypass_setup_failed", 503, "Open the project's Settings > Deployment Protection > Protection Bypass for Automation, add one, then run setup again.");
  return { secret: list[0][0], changed, extra: list.length - 1 };
}

const git = (workspace, args) => exec("git", args, { cwd: workspace });
/** The workspace's GitHub repository: `origin`, else a new private `<owner>/<folder name>` made with gh. */
function ensureRepository(workspace, owner) {
  if (!existsSync(join(workspace, ".git"))) requireThat(git(workspace, ["init", "-q", "-b", "main"]).status === 0, "git_init_failed", 503);
  let origin = git(workspace, ["remote", "get-url", "origin"]).stdout?.trim();
  if (!origin) {
    const login = owner ?? exec("gh", ["api", "user", "--jq", ".login"]).stdout?.trim();
    requireThat(login, "github_login_required", 409, "Sign in with `gh auth login`, or add the workspace's GitHub repository as `origin` yourself, then run setup again.");
    const repo = `${login}/${basename(workspace)}`;
    if (exec("gh", ["repo", "view", repo]).status !== 0) requireThat(exec("gh", ["repo", "create", repo, "--private"]).status === 0, "github_repository_failed", 503, `Create the private GitHub repository ${repo}, then run setup again.`);
    requireThat(git(workspace, ["remote", "add", "origin", `https://github.com/${repo}.git`]).status === 0, "git_remote_failed", 503);
    origin = `https://github.com/${repo}.git`;
  }
  const match = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(origin);
  requireThat(match, "github_origin_required", 409, "Vercel deploys from GitHub here: set the workspace's `origin` to its GitHub repository, then run setup again.");
  return { org: match[1], repo: match[2] };
}

/** The first push of workflows/ (with the root files). Once workflows/ is committed it is the workspace's own and setup never commits again. */
function publishRuntime(workspace) {
  if (git(workspace, ["ls-files", "--error-unmatch", "workflows/package.json"]).status === 0) return { pushed: false };
  // A fresh clone of an empty repository may start on another unborn branch name.
  if (git(workspace, ["rev-parse", "--verify", "-q", "HEAD"]).status !== 0) git(workspace, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  const branch = git(workspace, ["symbolic-ref", "--short", "HEAD"]).stdout?.trim();
  requireThat(branch === "main", "switch_to_main", 409, "Switch the workspace to its main branch, then run setup again.");
  if (git(workspace, ["ls-remote", "--exit-code", "--heads", "origin", "main"]).status === 0) {
    const pulled = git(workspace, ["rev-parse", "--verify", "-q", "HEAD"]).status === 0
      ? git(workspace, ["pull", "-q", "--ff-only", "origin", "main"]) : git(workspace, ["pull", "-q", "origin", "main"]);
    requireThat(pulled.status === 0, "pull_failed", 409, "The workspace's main branch has moved on GitHub in a way git cannot fast-forward: run `git pull` in the workspace, settle it, then run setup again.");
  }
  requireThat(git(workspace, ["add", "--", "workflows", ".gitignore", ".github"]).status === 0, "git_add_failed", 503);
  const commit = git(workspace, ["commit", "-q", "-m", "Add the workflow runtime"]);
  requireThat(commit.status === 0, "git_commit_failed", 409, "git could not commit: set your name and email (`git config --global user.name …` and `user.email …`), then run setup again.");
  requireThat(git(workspace, ["push", "-q", "-u", "origin", "main"]).status === 0, "git_push_failed", 409, "git could not push to GitHub: check `gh auth status` and access to the repository, then run setup again.");
  return { pushed: true, sha: git(workspace, ["rev-parse", "HEAD"]).stdout.trim() };
}

const githubAccess = (org, repo) => `Give Vercel access to the GitHub repository ${org}/${repo}: on GitHub, open the Vercel app's settings for ${org} (Settings > Applications > Vercel > Configure), add ${repo} under Repository access (or choose All repositories) and Save, then run setup --deploy again.`;
/** The project, created git-connected when missing; its settings and git connection repaired when they differ. */
async function ensureProject(api, team, name, { org, repo }, wanted, create = {}) {
  let project = await api("GET", `/v9/projects/${encodeURIComponent(name)}`), created = !project;
  if (!project) {
    project = await api("POST", "/v11/projects", { name, framework: "nitro", rootDirectory: "workflows", ...create, gitRepository: { type: "github", repo: `${org}/${repo}` } })
      .catch(() => { throw new SetupError("github_access_needed", 409, githubAccess(org, repo)); });
    project = await api("GET", `/v9/projects/${project.id}`);
  }
  requireThat(project?.id && project.accountId, "vercel_project_failed", 503);
  if (project.link?.org !== org || project.link?.repo !== repo) {
    requireThat(!project.link?.repo, "connected_to_other_repository", 409, `${name} deploys from ${project.link?.org}/${project.link?.repo}, not ${org}/${repo}. Change it under the project's Settings > Git, or pass --workflow-project, then run setup again.`);
    await api("POST", `/v9/projects/${project.id}/link`, { type: "github", repo: `${org}/${repo}` })
      .catch(() => { throw new SetupError("github_access_needed", 409, githubAccess(org, repo)); });
  }
  const patch = settingsPatch(project, wanted);
  if (Object.keys(patch).length) await api("PATCH", `/v9/projects/${project.id}`, patch);
  return { ...(await api("GET", `/v9/projects/${project.id}`)), team, created };
}

/**
 * `vercel link` in workflows/, where the Vercel app lives, so `vercel env pull`, `vercel curl` and `workflow inspect
 * --backend vercel` work there. A link to another project is never replaced silently.
 */
function linkWorkflows(workspace, project, env) {
  const runtime = join(workspace, "workflows"), file = join(runtime, ".vercel", "project.json");
  if (existsSync(file)) {
    requireThat(JSON.parse(readFileSync(file, "utf8")).projectId === project.id, "linked_to_other_project", 409,
      `workflows/ is linked to another Vercel project. In workflows/, run \`vercel link --yes --project ${project.name} --scope ${project.team}\`, then setup again.`);
    return "already";
  }
  // `vercel env pull` would bring production's database down (the Neon integration ticks Development by default).
  requireThat(!env.some((row) => DATABASE_VARIABLE.test(row.key) && row.target.includes("development")), "production_database_in_development", 409,
    "The project's Development environment holds a database. In Vercel, open the Neon integration's settings and untick Development for the production database, then run setup again.");
  // workflows/.gitignore already has the `.vercel` and `.env*` lines `vercel link` would otherwise append.
  requireThat(exec("vercel", ["link", "--yes", "--project", project.name, "--non-interactive", "--scope", project.team], { cwd: runtime }).status === 0, "vercel_link_failed", 503);
  return "now";
}

/**
 * Neon through the Vercel marketplace, Production only, for the linked project. Null when it needs the owner (terms, plan).
 * It runs in a scratch folder holding only the link, because `vercel integration add` also runs `npx skills add` for the
 * product's agent skills in its working directory, which would drop `.agents/`, `.claude/` and links in `skills/` into workflows/.
 */
async function ensureDatabase(api, workspace, project) {
  if (hasProduction(await safeEnvironment(api, project.id), "DATABASE_URL")) return "present";
  const scratch = mkdtempSync(join(tmpdir(), "gtm-neon-"));
  try {
    mkdirSync(join(scratch, ".vercel"));
    copyFileSync(join(workspace, "workflows", ".vercel", "project.json"), join(scratch, ".vercel", "project.json"));
    exec("vercel", ["integration", "add", "neon", "--name", project.name, "-e", "production", "-m", "region=iad1", "-m", "auth=false", "--no-env-pull", "--non-interactive", "--scope", project.team],
      { cwd: scratch });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
  return hasProduction(await safeEnvironment(api, project.id), "DATABASE_URL") ? "added" : null;
}

/** The share project: the share build the runtime trusts (other trusted projects, such as an agent, are not it), else `<runtime>-share`. */
async function findShare(api, runtime, name) {
  for (const id of Object.keys(runtime.trustedSources?.projects ?? {})) {
    const project = await api("GET", `/v9/projects/${id}`);
    if (project?.buildCommand === SHARE_SETTINGS.buildCommand) return project;
  }
  return api("GET", `/v9/projects/${encodeURIComponent(name)}`);
}
export const shareTrust = (runtime, shareId) => {
  const rules = runtime.trustedSources?.projects?.[shareId]?.customAllow;
  return rules?.length === 1 && rules[0].from?.slugs?.join() === "production" && rules[0].to?.slugs?.join() === "production";
};

const latestProduction = async (api, projectId) => (await api("GET", `/v6/deployments?projectId=${encodeURIComponent(projectId)}&target=production&limit=5`))?.deployments ?? [];
const ready = (row) => (row?.readyState ?? row?.state) === "READY";
/** Production is current when a ready deployment exists and no variable changed after it was made. */
export async function deploymentCurrent(api, project, env) {
  const newest = (await latestProduction(api, project.id)).find(ready);
  const changed = Math.max(0, ...env.filter((row) => row.target.includes("production")).map((row) => row.updatedAt));
  return Boolean(newest) && (newest.createdAt ?? newest.created ?? 0) >= changed;
}
/** A production deployment of the latest main, the way a push would make one. */
async function deployMain(api, project) {
  const made = await api("POST", "/v13/deployments", { name: project.name, project: project.id, target: "production",
    gitSource: { type: "github", repoId: project.link.repoId, ref: project.link.productionBranch || "main" } });
  requireThat(made?.id, "deploy_failed", 503);
  return made.id;
}
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
/** The deployment a push of `sha` started on a project connected before the push, if Vercel makes one within half a minute. */
async function pushDeployment(api, project, sha) {
  for (let tries = 0; tries < 6; tries++, await pause(5_000)) {
    const row = (await latestProduction(api, project.id)).find((row) => row.meta?.githubCommitSha === sha);
    if (row) return row.uid ?? row.id;
  }
  return null;
}
async function waitReady(api, project, { id }, minutes = 10) {
  for (const until = Date.now() + minutes * 60_000; Date.now() < until; await pause(8_000)) {
    const row = await api("GET", `/v13/deployments/${id}`);
    const state = row?.readyState ?? row?.state;
    if (state === "READY") return "ready";
    requireThat(state !== "ERROR" && state !== "CANCELED", "deployment_failed", 409, `${project.name}'s production build failed: read it with \`vercel inspect ${row?.url} --logs --scope ${project.team}\`, fix it, push, then run setup again.`);
  }
  return "building";
}

/**
 * Takes the workspace to production. Returns `production_ready`, `deploying` (a build is still running; nothing to do
 * but wait) or `needs_you` with the one step only a person can do; running it again afterwards carries on.
 */
export async function setupHosted(workspace, { team, project: name, share: shareName, agent: agentName, githubOwner }) {
  requireThat(typeof team === "string" && /^[a-zA-Z0-9_-]+$/.test(team), "team_required", 400, "Pass --team <Vercel team slug>.");
  requireThat(typeof name === "string" && /^[a-zA-Z0-9_-]+$/.test(name), "workflow_project_required", 400, "Pass --workflow-project <gtm-ws>.");
  const api = ownerApi(team), steps = {};
  const repository = ensureRepository(workspace, githubOwner);
  // Vercel connects only a repository that has commits, so the first push of workflows/ comes before the project.
  const published = publishRuntime(workspace);
  steps.push = published.pushed ? published.sha : "already";
  // The Vercel GitHub app often has access to selected repositories only; a new repository must be added there by hand.
  let runtime;
  try { runtime = await ensureProject(api, team, name, repository, RUNTIME_SETTINGS); }
  catch (error) { if (error.code === "github_access_needed") return { status: "needs_you", steps, instruction: error.instruction }; throw error; }
  requireThat(!Object.values(runtime.protectionBypass ?? {}).some((row) => row.scope !== "automation-bypass"), "remove_deployment_share_links_first", 409,
    "The project has deployment share links, which open every deployment. Remove them under Settings > Deployment Protection, then run setup again.");
  let env = await safeEnvironment(api, runtime.id), changed = false;
  steps.link = linkWorkflows(workspace, runtime, env);
  steps.database = await ensureDatabase(api, workspace, runtime);
  if (!steps.database) return { status: "needs_you", project: runtime.name, steps,
    instruction: `Add Neon to ${runtime.name}: in ${join(workspace, "workflows")} run \`vercel integration add neon -e production --scope ${team}\` and accept Neon's terms in the browser (only the first time this team uses Neon), then run setup --deploy again.` };
  env = await safeEnvironment(api, runtime.id);
  requireThat(!env.some((row) => DATABASE_VARIABLE.test(row.key) && !row.target.every((target) => target === "production")), "database_outside_production", 409,
    "A database variable is connected to Development or Preview. In Vercel, open the Neon integration's settings for this project and leave only Production ticked, then run setup again.");

  const origin = await productionOrigin(api, runtime.id);
  requireThat(origin, "production_domain_missing", 503, `${runtime.name} has no production domain; add one under Settings > Domains, then run setup again.`);
  const bypass = await ensureBypass(api, runtime);
  changed ||= bypass.changed;
  // Secrets are made once and never rotated by setup; the Keys page's project token is created and stored in one go (if
  // storing fails, the next run makes another and the unused one can be revoked under Account Settings > Tokens).
  for (const [key, bytes] of [["CRON_SECRET", 32], ["GTM_VIEWER_LINK_KEY", 32]]) changed = (await setProduction(api, runtime, env, key, random(bytes), { secret: true })) || changed;
  // A `vercel login` session cannot make tokens; then go-live finishes without the Keys page and asks for the token last.
  let keysToken;
  if (!hasProduction(env, "GTM_CONNECTIONS_VERCEL_TOKEN")) try {
    const grant = await api("POST", "/v3/user/tokens", { name: `Keys page for ${runtime.name}`, projectId: runtime.id });
    requireThat(typeof grant.bearerToken === "string" && grant.bearerToken.length > 0 && grant.token?.projectId === runtime.id, "project_token_creation_failed", 503);
    changed = (await setProduction(api, runtime, env, "GTM_CONNECTIONS_VERCEL_TOKEN", grant.bearerToken, { secret: true })) || changed;
  } catch (error) { if (error.code !== "project_token_dashboard_required") throw error; keysToken = error.instruction; }
  const teamSlug = team.startsWith("team_") ? (await api("GET", `/v2/teams/${runtime.accountId}`)).slug : team;
  const settings = { GTM_VIEWER_PROTECTED: "1", GTM_CONNECTIONS_ENABLED: "1", GTM_CONNECTIONS_TEAM_ID: runtime.accountId,
    GTM_CONNECTIONS_VERCEL_URL: `https://vercel.com/${teamSlug}/${runtime.name}/settings/environment-variables` };

  // The public share project: share links and the webhook relay. It trusts nothing but reaches the runtime through
  // production-to-production trust, and holds only the runtime's address and id.
  let share = await findShare(api, runtime, shareName ?? `${runtime.name}-share`);
  share = await ensureProject(api, team, share?.name ?? shareName ?? `${runtime.name}-share`, repository, SHARE_SETTINGS, { buildCommand: SHARE_SETTINGS.buildCommand });
  const shareEnv = await safeEnvironment(api, share.id);
  const leaked = shareEnv.filter((row) => PRIVATE_ONLY.test(row.key)).map((row) => row.key);
  requireThat(!leaked.length, "share_project_holds_private_credentials", 409, `Remove ${leaked.join(", ")} from ${share.name} (it is public), then run setup again.`);
  let shareChanged = false;
  for (const [key, value] of Object.entries({ GTM_VIEWER_PRIVATE_ORIGIN: origin, GTM_VIEWER_PRIVATE_PROJECT_ID: runtime.id }))
    shareChanged = (await setProduction(api, share, shareEnv, key, value)) || shareChanged;
  if (!shareTrust(runtime, share.id)) {
    await api("PATCH", `/v9/projects/${runtime.id}`, { trustedSources: { ...runtime.trustedSources, projects: { ...runtime.trustedSources?.projects,
      [share.id]: { label: "Workflow scoped sharing", customAllow: [{ from: { slugs: ["production"] }, to: { slugs: ["production"] } }] } } } });
    changed = true;
  }
  settings.GTM_VIEWER_SHARE_ORIGIN = await productionOrigin(api, share.id);
  let firewall;
  try { firewall = applyShareFirewall({ project: share.name, team }); } catch (error) { firewall = { project: share.name, status: "failed", code: error.code }; }
  steps.share = { project: share.name, firewall: firewall.status };

  // The GTM agent, when there is one: it reaches production with the bypass and is told about runs through the notify pair.
  if (agentName) {
    const agent = await api("GET", `/v9/projects/${encodeURIComponent(agentName)}`);
    requireThat(agent, "agent_project_not_found", 409, `No Vercel project ${agentName} in ${team}; run gtm-agent setup first, or leave out --agent-project.`);
    Object.assign(agent, { team });
    const agentEnv = await safeEnvironment(api, agent.id);
    let agentChanged = false;
    agentChanged = (await setProduction(api, agent, agentEnv, "GTM_WORKFLOW_URL", origin)) || agentChanged;
    // No agent code reads GTM_WORKFLOW_GATE_REQUIRED any more.
    if (hasProduction(agentEnv, "GTM_WORKFLOW_GATE_REQUIRED")) { removeVariable(agent, "GTM_WORKFLOW_GATE_REQUIRED"); agentChanged = true; }
    agentChanged = (await setProduction(api, agent, agentEnv, "GTM_WORKFLOW_BYPASS_SECRET", bypass.secret, { secret: true, replace: bypass.changed })) || agentChanged;
    if (!hasProduction(agentEnv, "GTM_NOTIFY_SECRET") || !hasProduction(env, "GTM_NOTIFY_SECRET")) {
      const secret = random(32);
      await setProduction(api, agent, agentEnv, "GTM_NOTIFY_SECRET", secret, { secret: true, replace: true });
      await setProduction(api, runtime, env, "GTM_NOTIFY_SECRET", secret, { secret: true, replace: true });
      agentChanged = changed = true;
    }
    settings.GTM_AGENT_URL = await productionOrigin(api, agent.id);
    if (agentChanged && agent.link?.repoId) await deployMain(api, agent);
    steps.agent = { project: agent.name, redeployed: agentChanged };
  }
  for (const [key, value] of Object.entries(settings)) if (value) changed = (await setProduction(api, runtime, env, key, value)) || changed;
  for (const key of new Set(env.filter((row) => RETIRED.test(row.key)).map((row) => row.key))) {
    removeVariable({ ...runtime, team }, key);
    changed = true;
  }

  // Deploy: a project with no ready deployment made after its last variable change (or whose bypass or variables
  // setup just changed) gets a production deployment of main, the way a push makes one; one a push setup just made
  // started is waited for instead.
  const waits = [];
  for (const [project, dirty] of [[runtime, changed], [share, shareChanged]]) {
    if (!dirty && await deploymentCurrent(api, project, await safeEnvironment(api, project.id))) continue;
    waits.push([project, { id: (published.pushed && !project.created && await pushDeployment(api, project, published.sha)) || await deployMain(api, project) }]);
  }
  const states = [];
  for (const [project, which] of waits) states.push(await waitReady(api, project, which));
  steps.deploy = waits.length ? Object.fromEntries(waits.map(([project], index) => [project.name, states[index]])) : "current";
  const building = states.includes("building");
  steps.neon = building ? { status: "after_deploy" } : saveNeonProject(workspace);
  // What only the owner can finish: the Keys page's token, and a database Neon would not shrink.
  const left = [keysToken && `Production is set up except the Keys page. ${keysToken}`, steps.neon.compute?.status === "not_sized" && steps.neon.compute.instruction].filter(Boolean);
  return { status: left.length ? "needs_you" : building ? "deploying" : "production_ready", project: runtime.name, projectId: runtime.id, origin, keysUrl: `${origin}/connections`, share: share.name,
    ...(bypass.extra ? { warning: `${runtime.name} has ${bypass.extra + 1} automation bypass secrets; only the first is used. Revoke the others under Settings > Deployment Protection.` } : {}),
    steps, ...(left.length ? { instruction: left.join(" ") }
      : building ? { instruction: "The production build is still running; run setup --deploy again in a few minutes to confirm it." } : {}) };
}

/**
 * What production needs that the Vercel dashboard does not show at a glance, each with its fix. `problems` is empty
 * when ready. Reads only.
 */
export async function doctorHosted({ team, project: name, linked, workspace }) {
  requireThat(team && name, "workflow_project_required", 409, "Pass --team and --workflow-project, or run setup --deploy first.");
  const api = ownerApi(team), runtime = await api("GET", `/v9/projects/${encodeURIComponent(name)}`);
  const setup = "run setup --deploy";
  if (!runtime) return { status: "not_live", problems: [{ check: `Vercel project ${name} exists`, fix: setup }] };
  const problems = [], add = (ok, check, fix = setup) => { if (!ok) problems.push({ check, fix }); };
  add(!linked || linked === runtime.id, "workflows/ is linked to this project", `in workflows/, \`vercel link --yes --project ${runtime.name} --scope ${team}\``);
  add(runtime.link?.repo, "The project deploys from the workspace's GitHub repository");
  const patch = settingsPatch(runtime, RUNTIME_SETTINGS);
  add(!Object.keys(patch).length, `Project settings (${Object.keys(patch).join(", ") || "all"}) as setup makes them`);
  add(!Object.values(runtime.protectionBypass ?? {}).some((row) => row.scope !== "automation-bypass"), "No deployment share links", "remove them under Settings > Deployment Protection");
  const bypass = bypassSummary(runtime);
  add(bypass.envVar, "An automation bypass the app sees as VERCEL_AUTOMATION_BYPASS_SECRET");
  add(bypass.count <= 1, "Only one automation bypass", "revoke the extra ones under Settings > Deployment Protection (keep the one used as the environment variable)");
  const env = await safeEnvironment(api, runtime.id);
  add(hasProduction(env, "DATABASE_URL") && hasProduction(env, "DATABASE_URL_UNPOOLED"), "Neon connected to Production", `in workflows/, \`vercel integration add neon -e production --scope ${team}\``);
  add(!env.some((row) => DATABASE_VARIABLE.test(row.key) && !row.target.every((target) => target === "production")), "No database in Development or Preview",
    "in the Neon integration's settings for this project, leave only Production ticked");
  add(hasProduction(env, "GTM_CONNECTIONS_VERCEL_TOKEN"), "Production has GTM_CONNECTIONS_VERCEL_TOKEN (the Keys page)",
    `on vercel.com, Account Settings > Tokens, create a token for this team limited to ${runtime.name}; save it with \`vercel env add GTM_CONNECTIONS_VERCEL_TOKEN production --sensitive\` in workflows/, then run setup --deploy`);
  for (const key of ["CRON_SECRET", "GTM_VIEWER_LINK_KEY", "GTM_VIEWER_PROTECTED", "GTM_CONNECTIONS_ENABLED", "GTM_CONNECTIONS_TEAM_ID", "GTM_VIEWER_SHARE_ORIGIN"])
    add(hasProduction(env, key), `Production has ${key}`);
  const origin = await productionOrigin(api, runtime.id);
  add(!env.some((row) => RETIRED.test(row.key)), "No retired variables (GTM_RUN_SECRET, GTM_DATA_URL, GTM_RUNS_URL, GTM_CONNECTIONS_ORIGIN, GTM_CONNECTIONS_MANAGED)");
  const share = await findShare(api, runtime, `${runtime.name}-share`);
  let shareFirewall = { status: "no_share_project" };
  add(share, "A share project exists");
  if (share) {
    add(shareTrust(runtime, share.id), `${runtime.name} trusts ${share.name} (production to production)`);
    add(!Object.keys(settingsPatch(share, SHARE_SETTINGS)).length && share.link?.repo === runtime.link?.repo, `${share.name} settings and repository as setup makes them`);
    const shareEnv = await safeEnvironment(api, share.id);
    add(!shareEnv.some((row) => PRIVATE_ONLY.test(row.key)), `${share.name} holds no private credentials`, `delete them from ${share.name}`);
    add(production(shareEnv, "GTM_VIEWER_PRIVATE_ORIGIN")[0]?.value === origin && production(shareEnv, "GTM_VIEWER_PRIVATE_PROJECT_ID")[0]?.value === runtime.id, `${share.name} points at ${origin}`);
    add(production(env, "GTM_VIEWER_SHARE_ORIGIN")[0]?.value === await productionOrigin(api, share.id), "GTM_VIEWER_SHARE_ORIGIN is the share project's address");
    shareFirewall = shareFirewallDrift({ project: share.name, team });
    add(shareFirewall.status === "current", `${share.name} rate limits match the template`);
    add(await deploymentCurrent(api, share, shareEnv), `${share.name} is deployed with its current variables`);
  }
  add(await deploymentCurrent(api, runtime, env), `${runtime.name} is deployed with its current variables`);
  // The database's size, through the Neon project setup saved; without it (or neonctl) it cannot be read, not a problem.
  const saved = workspace && existsSync(join(workspace, "workflows", "data", "neon.json")) ? JSON.parse(readFileSync(join(workspace, "workflows", "data", "neon.json"), "utf8")) : null;
  const compute = saved?.projectId ? readCompute(saved.projectId) : null;
  const oversized = compute ? computeProblems(compute.project, compute.endpoints) : [];
  add(!oversized.length, `The Neon database is at 0.25 CU with scale to zero (${oversized.join(", ") || "all"})`, "run setup --deploy, which sets it");
  const neonCompute = compute ? { status: oversized.length ? "oversized" : "smallest" } : { status: "unknown", instruction: "Run setup --deploy with neonctl signed in." };
  return { status: problems.length ? "needs_fixing" : "production_ready", project: runtime.name, origin, keysUrl: `${origin}/connections`, problems, shareFirewall, neonCompute };
}

/** Runs a CLI and returns its JSON output, or null when it fails. */
const json = (command, args, cwd) => {
  const result = exec(command, args, { cwd });
  if (result.status !== 0) return null;
  try { return JSON.parse(clean(result.stdout)); } catch { return null; }
};
/**
 * For copy-down (`npm run db:pull`) and imports: which Neon organization and project hold production's database. The
 * production marker names its endpoint (read through the linked project with `vercel curl`); the owner's `neonctl`
 * login finds the project with that endpoint, reading metadata only. Saved, without secrets, in the gitignored
 * `workflows/data/neon.json`. Not saved when either tool cannot answer (then copy-down and local imports are unavailable).
 */
export function saveNeonProject(workspace) {
  const runtime = join(workspace, "workflows");
  const reply = json("vercel", ["curl", "/api/query", "--", "-sS", "-X", "POST", "-H", "content-type: application/json", "-d", JSON.stringify({ sql: "select endpoint from gtm.environment where name = 'production'" })], runtime);
  const endpoint = reply?.rows?.[0]?.endpoint;
  if (typeof endpoint !== "string" || !/^ep-[a-z0-9-]+$/.test(endpoint)) return { status: "production_endpoint_unknown", instruction: "Copy-down needs the first production build; run setup --deploy again once it is live." };
  if (exec("neonctl", ["--version"]).status !== 0) return { status: "neonctl_missing", instruction: "For copy-down, install neonctl (`brew install neonctl`), sign in with `neonctl auth`, then run setup --deploy again." };
  for (const org of json("neonctl", ["orgs", "list", "--output", "json"]) ?? []) {
    const listed = json("neonctl", ["projects", "list", "--org-id", org.id, "--output", "json"]);
    for (const project of (Array.isArray(listed) ? listed : listed?.projects) ?? []) {
      const endpoints = json("neonctl", ["api", `/projects/${project.id}/endpoints`])?.endpoints ?? [];
      if (!endpoints.some((row) => row.id === endpoint)) continue;
      const neon = { orgId: org.id, projectId: project.id, endpoint };
      mkdirSync(join(runtime, "data"), { recursive: true });
      writeFileSync(join(runtime, "data", "neon.json"), JSON.stringify(neon, null, 2) + "\n");
      return { status: "saved", ...neon, compute: sizeNeon(project.id) };
    }
  }
  return { status: "neon_project_not_found", endpoint, instruction: "Sign in with `neonctl auth` as a member of the Neon organization Vercel made for this team, then run setup --deploy again." };
}

// Every workspace database runs on Neon's smallest compute and sleeps when idle, both the computes it has and any made
// later (the project default). The integration offers no size option, so setup sets it through the owner's neonctl.
// `suspend_timeout_seconds` 0 is Neon's default (5 minutes idle); -1 keeps the compute awake.
export const NEON_COMPUTE = { autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25 };
/** The fields of one compute's settings that differ from the smallest size with scale to zero; empty when it meets it. */
export const computePatch = (settings) => ({
  ...Object.fromEntries(Object.entries(NEON_COMPUTE).filter(([key, value]) => settings?.[key] !== value)),
  ...(settings?.suspend_timeout_seconds >= 0 ? {} : { suspend_timeout_seconds: 0 }),
});
/** What in a Neon project is above 0.25 CU or never sleeps, one line each. */
export const computeProblems = (project, endpoints) => [
  ...(Object.keys(computePatch(project?.default_endpoint_settings)).length ? ["the default for new computes"] : []),
  ...endpoints.filter((row) => Object.keys(computePatch(row)).length).map((row) => `compute ${row.id}`),
];
const readCompute = (projectId) => {
  const project = json("neonctl", ["api", `/projects/${projectId}`])?.project;
  const endpoints = json("neonctl", ["api", `/projects/${projectId}/endpoints`])?.endpoints;
  return project && Array.isArray(endpoints) ? { project, endpoints } : null;
};

/** Pins the project default and every compute at 0.25 CU with scale to zero, then reads them back to confirm. */
export function sizeNeon(projectId) {
  const before = readCompute(projectId);
  if (!before) return { status: "unknown" };
  const defaults = computePatch(before.project.default_endpoint_settings);
  // A live compute keeps its own limits when only the project default changes, so each is patched too.
  const patches = [
    ...(Object.keys(defaults).length ? [[`/projects/${projectId}`, { project: { default_endpoint_settings: { ...before.project.default_endpoint_settings, ...defaults } } }]] : []),
    ...before.endpoints.map((row) => [`/projects/${projectId}/endpoints/${row.id}`, { endpoint: computePatch(row) }]).filter(([, body]) => Object.keys(body.endpoint).length),
  ];
  if (!patches.length) return { status: "smallest" };
  for (const [path, body] of patches) exec("neonctl", ["api", path, "-X", "PATCH", "-d", JSON.stringify(body)]);
  const after = readCompute(projectId);
  const left = after ? computeProblems(after.project, after.endpoints) : ["unknown"];
  return left.length ? { status: "not_sized", left, instruction: `Neon project ${projectId}: set ${left.join(" and ")} to 0.25 CU minimum and maximum with scale to zero (Neon console, Compute), then run doctor.` }
    : { status: "sized" };
}
