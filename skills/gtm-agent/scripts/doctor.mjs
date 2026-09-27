#!/usr/bin/env node
import { doctorHosted } from "../../gtm-workflow/scripts/hosted.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  manifestIssues,
  installationIsCurrent,
  connectorUrl,
  connectorPatch,
} from "./slack-config.mjs";
// Checks one GTM Agent deployment end to end and says what to fix. Read-only unless --fix.
//   node doctor.mjs --slug acme --team acme-team [--github-owner acme] [--fix]
// Exit 0 when everything passes, 1 otherwise. Prints one line per check; no secret values.
import {
  api,
  connectors,
  deployFromGit,
  envNames,
  fail,
  http,
  latestProductionDeployment,
  parseArgs,
  productionUrl,
  project,
  REQUIRED_EVENTS,
  REQUIRED_SCOPES,
  run,
  setEnv,
  TRIGGER_PATH,
} from "./lib.mjs";

/** The names one deployment uses; overrides cover deployments made before this skill existed. */
export const names = (slug, o = {}) => ({
  agentProject: o["agent-project"] || `gtm-agent-${slug}`,
  workflowProject: o["workflow-project"] || `gtm-${slug}`,
  contextRepo: o["context-repo"] || `gtm-${slug}`,
  agentRepo: o["agent-repo"] || o["agent-project"] || `gtm-agent-${slug}`,
  connector: o["slack-connector"] || `slack/gtm-agent-${slug}`,
});

/** Runs every check; returns [{ name, ok, detail, fix }]. */
export async function check({
  slug,
  team,
  githubOwner,
  fix = false,
  overrides = {},
}) {
  const n = names(slug, overrides);
  const out = [];
  const add = (name, ok, detail = "", fixLine = "") =>
    out.push({ name, ok: Boolean(ok), detail, fix: ok ? "" : fixLine });

  // GitHub
  const ctx = run("gh", [
    "repo",
    "view",
    `${githubOwner}/${n.contextRepo}`,
    "--json",
    "name,isPrivate,defaultBranchRef",
  ]);
  add(
    "Context repository exists",
    ctx.status === 0,
    `${githubOwner}/${n.contextRepo}`,
    `gh repo create ${githubOwner}/${n.contextRepo} --private`,
  );
  const agentRepo = run("gh", [
    "repo",
    "view",
    `${githubOwner}/${n.agentRepo}`,
    "--json",
    "name",
  ]);
  add(
    "Agent repository exists",
    agentRepo.status === 0,
    `${githubOwner}/${n.agentRepo}`,
    "run setup.mjs",
  );

  // Agent project
  const ap = project(team, n.agentProject);
  add("Agent project exists", ap, n.agentProject, "run setup.mjs");
  if (!ap) return out;
  add(
    "Agent project is git-connected",
    ap.link?.repo === n.agentRepo,
    ap.link?.repo ?? "not connected",
    `vercel git connect (in the agent checkout) or run setup.mjs`,
  );
  add(
    "Agent project framework is eve",
    ap.framework === "eve",
    ap.framework ?? "none",
    `vercel project update ${n.agentProject} --framework eve --yes`,
  );
  if (!ap.previewDeploymentsDisabled && fix)
    api(team, "PATCH", `/v9/projects/${ap.id}`, {
      previewDeploymentsDisabled: true,
    });
  add(
    "Agent project preview deployments are off (they fail without the production variables)",
    ap.previewDeploymentsDisabled || fix,
    "",
    "run doctor.mjs --fix",
  );
  const aenv = envNames(team, n.agentProject);
  for (const k of [
    "GTM_WORKSPACE_REPOSITORY",
    "GTM_GITHUB_TOKEN",
    "SLACK_CONNECTOR",
  ])
    add(`Agent has ${k}`, aenv.has(k), "", "run setup.mjs");
  // GTM_RUN_SECRET is retired: the agent reaches the workflow project with Vercel's automation bypass only.
  add(
    "Agent has no retired GTM_RUN_SECRET",
    !aenv.has("GTM_RUN_SECRET"),
    "",
    "remove GTM_RUN_SECRET from the agent project",
  );

  // Slack connector
  const all = connectors(team);
  let c =
    all.find((x) => x.uid === n.connector) ??
    all.find(
      (x) =>
        x.type === "slack" &&
        (x.triggerDestinations ?? []).some((d) => d.projectId === ap.id),
    );
  add("Slack connector exists", c, c?.uid ?? "none", "run setup.mjs");
  if (c) {
    c = api(team, "GET", `/v1/connect/connectors/${c.id}`);
    const configFix = `node scripts/configure-slack.mjs --team ${team} --connector ${c.uid} --apply; then synchronize the Slack manifest and reinstall at ${connectorUrl(team, c.id)}`;
    add(
      "Vercel Slack configuration matches the selected profile",
      Object.keys(connectorPatch(c)).length === 0,
      "",
      configFix,
    );
    const installations = api(
      team,
      "GET",
      `/v1/connect/connectors/${c.id}/installations`,
      undefined,
      { allowFail: true },
    );
    add(
      "Slack installation approval is current",
      installationIsCurrent(c, installations?.installations),
      "",
      configFix,
    );
    let manifest;
    if (overrides["slack-manifest"]) {
      try {
        manifest = JSON.parse(
          readFileSync(overrides["slack-manifest"], "utf8"),
        );
      } catch {
        /* Report an invalid or missing export below, without its contents. */
      }
    }
    const providerIssues = manifestIssues(manifest, c);
    add(
      "Slack-side scopes, events, and interactivity match the selected configuration",
      providerIssues.length === 0,
      providerIssues.join(" "),
      `Export this app's saved Slack App Manifest and rerun with --slack-manifest <file.json>. ${configFix}`,
    );
    add(
      "Slack app is installed in a workspace",
      c.defaultInstallationId,
      c.data?.slackTeam?.name ?? "",
      "open the connector in the Vercel Connect dashboard and install it",
    );
    const events = new Set(c.events ?? []);
    const missingEvents = REQUIRED_EVENTS.filter((e) => !events.has(e));
    add(
      "Slack connector receives the message events",
      missingEvents.length === 0,
      missingEvents.length ? `missing ${missingEvents.join(", ")}` : "",
      configFix,
    );
    const scopes = new Set(c.data?.botScopes ?? []);
    const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.has(s));
    add(
      "Slack bot has the history and files scopes",
      missingScopes.length === 0,
      missingScopes.length ? `missing ${missingScopes.join(", ")}` : "",
      configFix,
    );
    const dest = (c.triggerDestinations ?? []).find(
      (d) => d.projectId === ap.id,
    );
    add(
      "Slack events are forwarded to the agent",
      dest?.path === TRIGGER_PATH,
      dest?.path ?? "no destination",
      `vercel connect attach ${c.uid} --project ${n.agentProject} --environment production --triggers --trigger-path ${TRIGGER_PATH} --yes --scope ${team}`,
    );
    const conn = api(
      team,
      "GET",
      `/v1/connect/connectors/${c.id}/projects/${ap.id}`,
      undefined,
      { allowFail: true },
    );
    add(
      "Agent project may use the connector's token",
      conn && (conn.environments ?? []).includes("production"),
      "",
      `vercel connect attach ${c.uid} --project ${n.agentProject} --environment production --yes --scope ${team}`,
    );
  }

  // Agent deployment
  const ad = latestProductionDeployment(team, n.agentProject);
  add(
    "Agent has a ready production deployment",
    ad?.readyState === "READY" || ad?.state === "READY",
    ad?.readyState ?? ad?.state ?? "none",
    "run setup.mjs (it deploys) or push to the agent repository",
  );
  const aurl = productionUrl(team, n.agentProject);
  if (aurl) {
    const h = await http(`${aurl}/eve/v1/health`);
    add(
      "Agent health route answers",
      h.status === 200,
      `${aurl}/eve/v1/health → ${h.status}`,
      "read the deployment's logs in Vercel",
    );
    const live = run("vercel", [
      "env",
      "run",
      "-e",
      "production",
      "--project",
      n.agentProject,
      "--scope",
      team,
      "--non-interactive",
      "--",
      "node",
      fileURLToPath(new URL("./slack-live-check.mjs", import.meta.url)),
      aurl,
    ]);
    let grant;
    try {
      grant = JSON.parse(
        live.stdout
          .trim()
          .split("\n")
          .filter((l) => l.startsWith("{"))
          .at(-1) ?? "{}",
      );
    } catch {}
    const missing = REQUIRED_SCOPES.filter(
      (scope) => !grant?.scopes?.includes(scope),
    );
    const extra = (grant?.scopes ?? []).filter(
      (scope) => !REQUIRED_SCOPES.includes(scope),
    );
    add(
      "Installed Slack token grants exactly the selected bot scopes",
      grant?.ok && missing.length === 0 && extra.length === 0,
      grant?.error ??
        [
          missing.length ? `missing ${missing.join(", ")}` : "",
          extra.length ? `old grants retained: ${extra.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; "),
      extra.length
        ? "Follow references/slack.md to remove retained grants; ordinary reapproval can keep old scopes. Record channel memberships before any disruptive reinstall."
        : "Deploy the current agent and reapprove the Slack installation; run Doctor with access to the agent production environment.",
    );
  }

  // Workflow project: its own production checks, then the wiring between it and this agent. Shared gtm-workflow setup
  // --deploy with --agent-project makes and repairs all of it.
  const wp = project(team, n.workflowProject);
  if (!wp && !aenv.has("GTM_WORKFLOW_URL")) {
    add("Workflow project", true, "not connected (optional until the first workflow)");
    return out;
  }
  const connect = `node <gtm-workflow skill>/scripts/setup.mjs --deploy --workspace ~/.gtm/${slug} --team ${team} --workflow-project ${n.workflowProject} --agent-project ${n.agentProject}`;
  const hosted = await doctorHosted({ team, project: n.workflowProject });
  for (const problem of hosted.problems)
    add(problem.check, false, "", problem.fix.replace("run setup --deploy", connect));
  if (!wp) return out;
  add(
    "Agent has GTM_WORKFLOW_URL, GTM_WORKFLOW_BYPASS_SECRET and GTM_WORKFLOW_GATE_REQUIRED",
    ["GTM_WORKFLOW_URL", "GTM_WORKFLOW_BYPASS_SECRET", "GTM_WORKFLOW_GATE_REQUIRED"].every((k) => aenv.has(k)),
    "",
    connect,
  );
  const wenv = envNames(team, n.workflowProject);
  add(
    "Agent and workflow project share GTM_NOTIFY_SECRET, and the workflow project has GTM_AGENT_URL",
    aenv.has("GTM_NOTIFY_SECRET") && wenv.has("GTM_NOTIFY_SECRET") && wenv.has("GTM_AGENT_URL"),
    "",
    connect,
  );
  if (aenv.has("GTM_WORKFLOW_URL")) {
    // The agent-only routes accept only the bypass the app sees as VERCEL_AUTOMATION_BYPASS_SECRET; prove the agent holds it.
    const probe = run("vercel", ["env", "run", "-e", "production", "--project", n.agentProject, "--scope", team, "--non-interactive", "--",
      "node", fileURLToPath(new URL("./workflow-live-check.mjs", import.meta.url))]);
    let answer = {};
    try { answer = JSON.parse(probe.stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1) ?? "{}"); } catch {}
    add(
      "Agent reaches the workflow project's agent-only routes",
      answer.status === 200,
      answer.error ?? `/api/connections → ${answer.status ?? "no answer"}`,
      answer.status === 401
        ? `the agent holds another bypass than the one the app uses: delete GTM_WORKFLOW_BYPASS_SECRET on ${n.agentProject}, then ${connect}`
        : `redeploy both projects (${connect})`,
    );
  }
  add(
    "Context repository has workflows/",
    run("gh", ["api", `repos/${githubOwner}/${n.contextRepo}/contents/workflows/package.json`]).status === 0,
    "",
    connect,
  );
  return out;
}

export function print(results) {
  for (const r of results)
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}${r.fix ? `\n    fix: ${r.fix}` : ""}`,
    );
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? `\n${bad} to fix.` : "\nAll good.");
  return bad === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2), { flags: ["fix"] });
  if (!a.slug || !a.team)
    fail(
      "usage: doctor.mjs --slug <org-slug> --team <vercel-team-slug> [--github-owner <owner>] [--agent-project <name>] [--workflow-project <name>] [--context-repo <name>] [--slack-connector <uid>] [--slack-manifest <saved-export.json>] [--fix]",
    );
  const githubOwner =
    a["github-owner"] ||
    run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
  const results = await check({
    slug: a.slug,
    team: a.team,
    githubOwner,
    fix: Boolean(a.fix),
    overrides: a,
  });
  process.exit(print(results) ? 0 : 1);
}
