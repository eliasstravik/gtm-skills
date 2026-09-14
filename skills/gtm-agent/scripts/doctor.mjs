#!/usr/bin/env node
// Checks one GTM Agent deployment end to end and says what to fix. Read-only unless --fix.
//   node doctor.mjs --slug acme --team acme-team [--github-owner acme] [--fix]
// Exit 0 when everything passes, 1 otherwise. Prints one line per check; no secret values.
import { fileURLToPath } from "node:url";
import { api, connectors, deployFromGit, envNames, fail, http, latestProductionDeployment, parseArgs, productionUrl, project, REQUIRED_EVENTS, REQUIRED_SCOPES, run, setEnv, TRIGGER_PATH } from "./lib.mjs";

/** The names one deployment uses; overrides cover deployments made before this skill existed. */
export const names = (slug, o = {}) => ({
  agentProject: o["agent-project"] || `gtm-agent-${slug}`,
  workflowProject: o["workflow-project"] || `gtm-${slug}-workflows`,
  contextRepo: o["context-repo"] || `gtm-${slug}`,
  agentRepo: o["agent-repo"] || o["agent-project"] || `gtm-agent-${slug}`,
  connector: o["slack-connector"] || `slack/gtm-agent-${slug}`,
});

/** Runs every check; returns [{ name, ok, detail, fix }]. */
export async function check({ slug, team, githubOwner, fix = false, overrides = {} }) {
  const n = names(slug, overrides);
  const out = [];
  const add = (name, ok, detail = "", fixLine = "") => out.push({ name, ok: Boolean(ok), detail, fix: ok ? "" : fixLine });

  // GitHub
  const ctx = run("gh", ["repo", "view", `${githubOwner}/${n.contextRepo}`, "--json", "name,isPrivate,defaultBranchRef"]);
  add("Context repository exists", ctx.status === 0, `${githubOwner}/${n.contextRepo}`, `gh repo create ${githubOwner}/${n.contextRepo} --private`);
  const agentRepo = run("gh", ["repo", "view", `${githubOwner}/${n.agentRepo}`, "--json", "name"]);
  add("Agent repository exists", agentRepo.status === 0, `${githubOwner}/${n.agentRepo}`, "run setup.mjs");

  // Agent project
  const ap = project(team, n.agentProject);
  add("Agent project exists", ap, n.agentProject, "run setup.mjs");
  if (!ap) return out;
  add("Agent project is git-connected", ap.link?.repo === n.agentRepo, ap.link?.repo ?? "not connected", `vercel git connect (in the agent checkout) or run setup.mjs`);
  add("Agent project framework is eve", ap.framework === "eve", ap.framework ?? "none", `vercel project update ${n.agentProject} --framework eve --yes`);
  if (!ap.previewDeploymentsDisabled && fix) api(team, "PATCH", `/v9/projects/${ap.id}`, { previewDeploymentsDisabled: true });
  add("Agent project preview deployments are off (they fail without the production variables)", ap.previewDeploymentsDisabled || fix, "", "run doctor.mjs --fix");
  const aenv = envNames(team, n.agentProject);
  for (const k of ["GTM_WORKSPACE_REPOSITORY", "GTM_GITHUB_TOKEN", "SLACK_CONNECTOR"]) add(`Agent has ${k}`, aenv.has(k), "", "run setup.mjs");
  const wfPair = ["GTM_WORKFLOW_URL", "GTM_RUN_SECRET"].map((k) => aenv.has(k));
  add("Agent workflow variables are both set or both absent", wfPair[0] === wfPair[1], wfPair.join("/"), "run setup.mjs (it sets both) or remove the one that is set");
  const notifyPair = ["GTM_NOTIFY_SECRET"].map((k) => aenv.has(k));
  add("Agent has GTM_NOTIFY_SECRET", notifyPair[0], "", "run setup.mjs");
  for (const k of ["TURSO_STUDIO_URL", "TURSO_STUDIO_TOKEN"]) {
    if (aenv.has(k)) {
      if (fix) { run("vercel", ["env", "rm", k, "production", "--project", n.agentProject, "--yes", "--scope", team, "--non-interactive"]); add(`Removed obsolete ${k}`, true); }
      else add(`Obsolete ${k} still set`, false, "not read since gtm-agent 0.1.27", `vercel env rm ${k} production --project ${n.agentProject} --scope ${team}`);
    }
  }

  // Slack connector
  const all = connectors(team);
  const c = all.find((x) => x.uid === n.connector) ?? all.find((x) => x.type === "slack" && (x.triggerDestinations ?? []).some((d) => d.projectId === ap.id));
  add("Slack connector exists", c, c?.uid ?? "none", "run setup.mjs");
  if (c) {
    add("Slack app is installed in a workspace", c.defaultInstallationId, c.data?.slackTeam?.name ?? "", "open the connector in the Vercel Connect dashboard and install it");
    const events = new Set(c.events ?? []);
    const missingEvents = REQUIRED_EVENTS.filter((e) => !events.has(e));
    add("Slack connector receives the message events", missingEvents.length === 0, missingEvents.length ? `missing ${missingEvents.join(", ")}` : "", "Connect dashboard → the connector → Advanced → Trigger Event Types: add them");
    const scopes = new Set(c.data?.botScopes ?? []);
    const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.has(s));
    add("Slack bot has the history and files scopes", missingScopes.length === 0, missingScopes.length ? `missing ${missingScopes.join(", ")}` : "", "Connect dashboard → the connector → Advanced → Bot Scopes: add them, then reinstall when Slack asks");
    const dest = (c.triggerDestinations ?? []).find((d) => d.projectId === ap.id);
    add("Slack events are forwarded to the agent", dest?.path === TRIGGER_PATH, dest?.path ?? "no destination", `vercel connect attach ${c.uid} --project ${n.agentProject} --environment production --triggers --trigger-path ${TRIGGER_PATH} --yes --scope ${team}`);
    const conn = api(team, "GET", `/v1/connect/connectors/${c.id}/projects/${ap.id}`, undefined, { allowFail: true });
    add("Agent project may use the connector's token", conn && (conn.environments ?? []).includes("production"), "", `vercel connect attach ${c.uid} --project ${n.agentProject} --environment production --yes --scope ${team}`);
  }

  // Agent deployment
  const ad = latestProductionDeployment(team, n.agentProject);
  add("Agent has a ready production deployment", ad?.readyState === "READY" || ad?.state === "READY", ad?.readyState ?? ad?.state ?? "none", "run setup.mjs (it deploys) or push to the agent repository");
  const aurl = productionUrl(team, n.agentProject);
  if (aurl) {
    const h = await http(`${aurl}/eve/v1/health`);
    add("Agent health route answers", h.status === 200, `${aurl}/eve/v1/health → ${h.status}`, "read the deployment's logs in Vercel");
  }

  // Workflow project
  const wp = project(team, n.workflowProject);
  if (!wfPair[0] && !wp) { add("Workflow project", true, "not connected (optional until the first workflow)"); return out; }
  add("Workflow project exists", wp, n.workflowProject, "run setup.mjs");
  if (!wp) return out;
  add("Workflow project is git-connected to the context repository", wp.link?.repo === n.contextRepo, wp.link?.repo ?? "not connected", "run setup.mjs");
  const patch = {};
  const want = { rootDirectory: "workflows", nodeVersion: "22.x", autoExposeSystemEnvs: true, commandForIgnoringBuildStep: "git diff --quiet HEAD^ HEAD -- .", previewDeploymentsDisabled: true };
  for (const [k, v] of Object.entries(want)) {
    const okv = wp[k] === v;
    if (!okv && fix) patch[k] = v;
    add(`Workflow project ${k} is ${JSON.stringify(v)}`, okv || fix, okv ? "" : `was ${JSON.stringify(wp[k])}`, "run doctor.mjs --fix");
  }
  const ssoOff = wp.ssoProtection == null && wp.passwordProtection == null;
  if (!ssoOff && fix) patch.ssoProtection = null;
  add("Workflow project deployment protection is off", ssoOff || fix, ssoOff ? "" : "on", `vercel project protection disable ${n.workflowProject} --sso --scope ${team}`);
  add("Workflow project OIDC is on (AI Gateway needs no key)", wp.oidcTokenConfig?.enabled !== false, "", "Vercel → project → Settings → Security → Secure Backend Access with OIDC");
  if (Object.keys(patch).length) api(team, "PATCH", `/v9/projects/${wp.id}`, patch);
  const wenv = envNames(team, n.workflowProject);
  for (const k of ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN", "GTM_RUN_SECRET", "CRON_SECRET", "GTM_MODEL", "GTM_AGENT_URL", "GTM_NOTIFY_SECRET"]) add(`Workflow project has ${k}`, wenv.has(k), "", k.startsWith("TURSO") ? "run setup.mjs (it connects Turso)" : "run setup.mjs");
  // The hosted Runs link: derivable from the team and project, so --fix writes it; a redeploy makes the link route see it.
  const runsUrl = `https://vercel.com/${team}/${n.workflowProject}/observability/workflows`;
  let redeploy = false;
  if (!wenv.has("GTM_RUNS_URL") && fix) { setEnv(team, n.workflowProject, "GTM_RUNS_URL", runsUrl, { secret: false }); redeploy = true; }
  add("Workflow project has GTM_RUNS_URL (the Runs button)", wenv.has("GTM_RUNS_URL") || fix, "", "run doctor.mjs --fix");
  if (wenv.has("AI_GATEWAY_API_KEY")) add("Workflow project still holds AI_GATEWAY_API_KEY", true, "unneeded since gtm-skills 0.1.24; remove it once a hosted run has succeeded without it");
  add("Context repository has workflows/", run("gh", ["api", `repos/${githubOwner}/${n.contextRepo}/contents/workflows/package.json`]).status === 0, "", "run setup.mjs (it scaffolds the runtime)");
  const wd = latestProductionDeployment(team, n.workflowProject);
  add("Workflow project has a ready production deployment", wd?.readyState === "READY" || wd?.state === "READY", wd?.readyState ?? wd?.state ?? "none", "run setup.mjs or push a change under workflows/");
  if (redeploy) add("Workflow project redeploys with the new variable", Boolean(deployFromGit(team, n.workflowProject)), "about two minutes", "push a change under workflows/");
  const wurl = productionUrl(team, n.workflowProject);
  if (wurl) {
    const l = await http(`${wurl}/api/link/example-scores`);
    add("Workflow routes answer (401 without the secret is right)", l.status === 401, `${wurl}/api/link/example-scores → ${l.status}`, "read the deployment's logs in Vercel");
  }
  return out;
}

export function print(results) {
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}${r.fix ? `\n    fix: ${r.fix}` : ""}`);
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `\n${bad} to fix.` : "\nAll good.");
  return bad === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2), { flags: ["fix"] });
  if (!a.slug || !a.team) fail("usage: doctor.mjs --slug <org-slug> --team <vercel-team-slug> [--github-owner <owner>] [--agent-project <name>] [--workflow-project <name>] [--context-repo <name>] [--slack-connector <uid>] [--fix]");
  const githubOwner = a["github-owner"] || run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
  const results = await check({ slug: a.slug, team: a.team, githubOwner, fix: Boolean(a.fix), overrides: a });
  process.exit(print(results) ? 0 : 1);
}
