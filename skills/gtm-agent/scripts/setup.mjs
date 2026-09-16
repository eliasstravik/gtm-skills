#!/usr/bin/env node
// Deploys one GTM Agent end to end and wires it to its workspace repository and workflow project. Idempotent: every
// step checks what exists and moves on, so it can be run again after a fix. Needs gh and vercel signed in, Node 22+.
//
//   node setup.mjs --slug acme --team acme-team [--github-owner acme] [--channel C0…] [--model openai/gpt-5.6-luna]
//                  [--region iad1] [--no-workflows] [--slack-connector slack/existing] [--skip-slack]
//
// Exit 0: done. Exit 2: a human step is needed (the message says which); run again afterwards. Exit 1: failed.
// Human steps: native account login, Slack installation, provider terms, and the
// project-scoped Connections token setup and native Vercel browser verification.
import { connectorPatch, connectorUrl } from "./slack-config.mjs";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, names, print } from "./doctor.mjs";
import {
  api,
  connectors,
  deployFromGit,
  envNames,
  fail,
  ghJson,
  must,
  ok,
  parseArgs,
  productionUrl,
  project,
  REQUIRED_EVENTS,
  REQUIRED_SCOPES,
  run,
  say,
  setEnv,
  slugOk,
  spawnStreaming,
  TEMPLATE_REPO,
  todo,
  TRIGGER_PATH,
  vercel,
  waitForDeployment,
} from "./lib.mjs";

const a = parseArgs(process.argv.slice(2), {
  flags: ["workflows", "skip-slack", "intake-protection-verified"],
});
if (!a.slug || !a.team)
  fail(
    "usage: setup.mjs --slug <org-slug> --team <vercel-team-slug> [--github-owner <owner>] [--channel <C0…>] [--no-workflows]",
  );
if (!slugOk(a.slug))
  fail(`--slug must be lowercase kebab-case, 1-40 characters, got ${a.slug}`);
const slug = a.slug;
const team = a.team;
const withWorkflows = a.workflows !== false;
const n = names(slug, a);
const gtmHome = join(homedir(), ".gtm");
const agentDir = join(gtmHome, ".agents", slug);
const workspaceDir = join(gtmHome, slug);
const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
const templates = join(dirname(skillDir), "gtm-workflow", "templates");

// 0. Preflight
const major = Number(process.versions.node.split(".")[0]);
if (major < 22)
  fail(`Node 22 or newer is needed (found ${process.versions.node})`);
if (run("gh", ["auth", "status"]).status !== 0)
  fail("gh is not signed in: run `gh auth login`");
if (run("vercel", ["whoami"]).status !== 0)
  fail("vercel is not signed in: run `vercel login`");
if (!api(team, "GET", `/v2/teams/${team}`, undefined, { allowFail: true }))
  fail(`Vercel team ${team} not found; run \`vercel teams ls\``);
const githubOwner = a["github-owner"] || ghJson(["api", "user"]).login;
const ghUser = ghJson(["api", "user"]).login;
if (!existsSync(templates))
  fail(
    `gtm-workflow templates not found at ${templates}; install gtm-workflow next to this skill`,
  );
ok(`Preflight: team ${team}, GitHub owner ${githubOwner}, slug ${slug}`);

// 1. Context repository (empty; the agent's first save scaffolds it)
const ctxRepo = `${githubOwner}/${n.contextRepo}`;
if (run("gh", ["repo", "view", ctxRepo]).status === 0)
  ok(`Context repository ${ctxRepo} exists`);
else {
  must("gh", ["repo", "create", ctxRepo, "--private"]);
  ok(`Created private repository ${ctxRepo}`);
}

// 2. Agent repository: a private copy of the template with a `template` remote for upgrades
const agentRepo = `${githubOwner}/${n.agentRepo}`;
mkdirSync(dirname(agentDir), { recursive: true });
if (!existsSync(join(agentDir, ".git"))) {
  if (run("gh", ["repo", "view", agentRepo]).status === 0) {
    must("gh", ["repo", "clone", agentRepo, agentDir]);
  } else {
    must("git", [
      "clone",
      "-q",
      `https://github.com/${TEMPLATE_REPO}.git`,
      agentDir,
    ]);
    must("git", ["remote", "rename", "origin", "template"], { cwd: agentDir });
    must("gh", [
      "repo",
      "create",
      agentRepo,
      "--private",
      "--source",
      agentDir,
      "--remote",
      "origin",
      "--push",
    ]);
    ok(`Created private repository ${agentRepo} from ${TEMPLATE_REPO}`);
  }
}
if (
  run("git", ["remote", "get-url", "template"], { cwd: agentDir }).status !== 0
)
  must(
    "git",
    ["remote", "add", "template", `https://github.com/${TEMPLATE_REPO}.git`],
    { cwd: agentDir },
  );
ok(`Agent checkout at ${agentDir}`);

// 3. Agent Vercel project, git-connected
if (!project(team, n.agentProject)) {
  vercel(["project", "add", n.agentProject], { team });
  ok(`Created Vercel project ${n.agentProject}`);
}
vercel(["link", "--yes", "--project", n.agentProject, "--team", team], {
  cwd: agentDir,
});
let ap = project(team, n.agentProject);
if (ap.link?.repo !== n.agentRepo) {
  vercel(["git", "connect", `https://github.com/${agentRepo}`], {
    team,
    cwd: agentDir,
  });
  ap = project(team, n.agentProject);
}
if (ap.link?.repo !== n.agentRepo)
  fail(
    `Could not connect ${n.agentProject} to ${agentRepo}. Install the Vercel GitHub app for ${githubOwner} (Vercel → Settings → Git) and run again.`,
  );
// Previews are useless for a Slack agent and fail without the production-only variables, so they are off.
if (
  ap.framework !== "eve" ||
  ap.nodeVersion !== "24.x" ||
  !ap.previewDeploymentsDisabled
)
  api(team, "PATCH", `/v9/projects/${ap.id}`, {
    framework: "eve",
    nodeVersion: "24.x",
    previewDeploymentsDisabled: true,
  });
ok(`Vercel project ${n.agentProject} is connected to ${agentRepo}`);

// 4. Agent variables
const aenv = envNames(team, n.agentProject);
if (!aenv.has("GTM_WORKSPACE_REPOSITORY"))
  setEnv(team, n.agentProject, "GTM_WORKSPACE_REPOSITORY", ctxRepo);
if (!aenv.has("GTM_GITHUB_TOKEN"))
  setEnv(
    team,
    n.agentProject,
    "GTM_GITHUB_TOKEN",
    must("gh", ["auth", "token"]).trim(),
  );
if (a.channel && !aenv.has("GTM_NOTIFY_CHANNEL"))
  setEnv(team, n.agentProject, "GTM_NOTIFY_CHANNEL", a.channel, {
    secret: false,
  });
if (a.model && !aenv.has("GTM_AGENT_MODEL"))
  setEnv(team, n.agentProject, "GTM_AGENT_MODEL", a.model, { secret: false });
ok(`Agent variables set (repository ${ctxRepo}, commits as ${ghUser})`);

// 5. Slack connector: created and installed in one browser trip
let connector = connectors(team).find((c) => c.uid === n.connector);
if (!connector && !a["skip-slack"]) {
  say(
    `\n→ Slack: a browser page will open (or copy the address below). Pick the Slack workspace. Configure the creation form with\n   Trigger Event Types: ${REQUIRED_EVENTS.join(", ")}\n   Bot Scopes: ${REQUIRED_SCOPES.join(", ")}\n   then Allow. This script waits.\n`,
  );
  const code = await spawnStreaming(
    "vercel",
    [
      "connect",
      "create",
      "slack",
      "--connection-method",
      "slack-app",
      "--name",
      n.agentProject,
      "--triggers",
      ...REQUIRED_EVENTS.flatMap((e) => ["--trigger-event", e]),
      "--trigger-path",
      TRIGGER_PATH,
      "--trigger-project",
      n.agentProject,
      "--yes",
      "--non-interactive",
      "--scope",
      team,
    ],
    { cwd: agentDir },
  );
  connector = connectors(team).find((c) => c.uid === n.connector);
  if (code !== 0 || !connector) {
    say(
      "\nThe Slack install did not complete. Finish it in the browser, then run this script again.",
    );
    process.exit(2);
  }
}
if (connector) {
  const patch = connectorPatch(connector);
  if (Object.keys(patch).length) {
    const result = api(
      team,
      "PATCH",
      `/v2/connect/connectors/${connector.id}`,
      patch,
    );
    connector = result.connector;
    say(
      `Slack configuration saved. Synchronize the Slack App Manifest, then reinstall at ${connectorUrl(team, connector.id)}. See references/slack.md; Vercel saving the values alone does not verify Slack.`,
    );
  }
  const dest = (connector.triggerDestinations ?? []).find(
    (d) => d.projectId === ap.id,
  );
  if (dest?.path !== TRIGGER_PATH)
    vercel(
      [
        "connect",
        "attach",
        connector.uid,
        "--project",
        n.agentProject,
        "--environment",
        "production",
        "--triggers",
        "--trigger-path",
        TRIGGER_PATH,
        "--yes",
      ],
      { team, cwd: agentDir },
    );
  if (!aenv.has("SLACK_CONNECTOR"))
    setEnv(team, n.agentProject, "SLACK_CONNECTOR", connector.uid);
  ok(
    `Slack connector ${connector.uid}${connector.defaultInstallationId ? ` installed in ${connector.data?.slackTeam?.name ?? "the workspace"}` : " (not installed yet)"}`,
  );
} else {
  todo(
    "Slack skipped (--skip-slack); the agent will not answer in Slack until a connector is attached",
  );
}

// 6. Deploy the agent from git and learn its address
if (!withWorkflows || !project(team, n.agentProject)?.targets?.production) {
  todo("Deploying the agent (about a minute)");
  await waitForDeployment(team, deployFromGit(team, n.agentProject));
}
const agentUrl = productionUrl(team, n.agentProject);
ok(`Agent live at ${agentUrl}`);

// 7. Workflow project, optional
if (withWorkflows) {
  if (!existsSync(join(workspaceDir, ".git"))) {
    mkdirSync(gtmHome, { recursive: true });
    must("gh", ["repo", "clone", ctxRepo, workspaceDir]);
  }
  // Workspace and connection provisioning have one implementation. The same
  // setup runs without an agent project for standalone installations.
  const sharedSetup = join(dirname(skillDir), "gtm-workflow", "scripts", "setup.mjs");
  const code = await spawnStreaming(process.execPath, [sharedSetup, "--deploy", "--workspace", workspaceDir, "--team", team,
    "--github-owner", githubOwner, "--workflow-project", n.workflowProject, "--agent-project", n.agentProject,
    "--agent-repository", agentRepo, ...(a["share-project"] ? ["--share-project", a["share-project"]] : []),
    ...(a["intake-protection-verified"] ? ["--intake-protection-verified"] : []),
    ...(a.verification ? ["--verification", a.verification] : [])]);
  if (code !== 0) process.exit(code);
  ok("Workflow and Connections setup verified");
}

// 8. Doctor
say("\nChecking everything:");
const healthy = print(await check({ slug, team, githubOwner, overrides: a }));

say(
  `\n${healthy ? "Done" : "Setup needs the checks above completed"}. In Slack: invite the app named ${n.agentProject} to your GTM channel, then say:\n  @${n.agentProject} set up our GTM workspace\n${a.channel ? "" : "Workflow notifications need a channel: add GTM_NOTIFY_CHANNEL (a channel id) on the agent project, or run again with --channel.\n"}`,
);
process.exit(healthy ? 0 : 1);
