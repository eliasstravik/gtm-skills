#!/usr/bin/env node
import {
  prepareViewer,
  activateViewer,
  enableSharing,
} from "./viewer-config.mjs";
// Deploys one GTM Agent end to end and wires it to its workspace repository and workflow project. Idempotent: every
// step checks what exists and moves on, so it can be run again after a fix. Needs gh and vercel signed in, Node 22+.
//
//   node setup.mjs --slug acme --team acme-team [--github-owner acme] [--channel C0…] [--model openai/gpt-5.6-luna]
//                  [--region iad1] [--no-workflows] [--slack-connector slack/existing] [--skip-slack]
//
// Exit 0: done. Exit 2: a human step is needed (the message says which); run again afterwards. Exit 1: failed.
// Two things stay human: the Slack install (one browser trip, the script prints the address and waits) and, the first
// time a Vercel team uses Turso, accepting the marketplace terms.
import { connectorPatch, connectorUrl } from "./slack-config.mjs";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
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
const linkDir = join(gtmHome, ".links", n.workflowProject);
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
todo("Deploying the agent (about a minute)");
await waitForDeployment(team, deployFromGit(team, n.agentProject));
const agentUrl = productionUrl(team, n.agentProject);
ok(`Agent live at ${agentUrl}`);

// 7. Workflow project, optional
if (withWorkflows) {
  // 7a. The workflow runtime in the context repository, so the project is live before the first workflow
  if (!existsSync(join(workspaceDir, ".git"))) {
    mkdirSync(gtmHome, { recursive: true });
    must("gh", ["repo", "clone", ctxRepo, workspaceDir]);
  }
  run("git", ["pull", "-q", "--ff-only"], { cwd: workspaceDir });
  if (!existsSync(join(workspaceDir, "workflows", "package.json"))) {
    todo(
      "Adding the workflow runtime to the context repository (npm install takes a minute)",
    );
    const wf = join(workspaceDir, "workflows");
    cpSync(templates, wf, { recursive: true });
    renameSync(join(wf, "gitignore"), join(wf, ".gitignore"));
    rmSync(join(wf, "env.example"), { force: true });
    must("npm", ["install", "--no-audit", "--no-fund", "--silent"], {
      cwd: wf,
    });
    if (
      run("git", ["rev-parse", "--verify", "HEAD"], { cwd: workspaceDir })
        .status !== 0
    )
      must("git", ["symbolic-ref", "HEAD", "refs/heads/main"], {
        cwd: workspaceDir,
      });
    must("git", ["add", "workflows"], { cwd: workspaceDir });
    must(
      "git",
      [
        "-c",
        "user.name=gtm-agent setup",
        `-c`,
        `user.email=${ghUser}@users.noreply.github.com`,
        "commit",
        "-q",
        "-m",
        "Add the workflow runtime",
      ],
      { cwd: workspaceDir },
    );
    must("git", ["push", "-q", "-u", "origin", "main"], { cwd: workspaceDir });
    ok("Workflow runtime pushed to the context repository");
  } else ok("Context repository already has the workflow runtime");

  // 7b. Project, linked to the repository with root directory workflows
  if (!project(team, n.workflowProject)) {
    vercel(["project", "add", n.workflowProject], { team });
    ok(`Created Vercel project ${n.workflowProject}`);
  }
  if (!existsSync(join(linkDir, ".git"))) {
    mkdirSync(dirname(linkDir), { recursive: true });
    must("gh", ["repo", "clone", ctxRepo, linkDir]);
  }
  vercel(["link", "--yes", "--project", n.workflowProject, "--team", team], {
    cwd: linkDir,
  });
  let wp = project(team, n.workflowProject);
  if (wp.link?.repo !== n.contextRepo) {
    vercel(["git", "connect", `https://github.com/${ctxRepo}`], {
      team,
      cwd: linkDir,
    });
    wp = project(team, n.workflowProject);
  }
  if (wp.link?.repo !== n.contextRepo)
    fail(
      `Could not connect ${n.workflowProject} to ${ctxRepo}; install the Vercel GitHub app for ${githubOwner} and run again.`,
    );
  const want = {
    rootDirectory: "workflows",
    nodeVersion: "22.x",
    framework: "nitro",
    autoExposeSystemEnvs: true,
    commandForIgnoringBuildStep: "git diff --quiet HEAD^ HEAD -- .",
    previewDeploymentsDisabled: true,
  };
  const patch = Object.fromEntries(
    Object.entries(want).filter(
      ([k, v]) => JSON.stringify(wp[k] ?? null) !== JSON.stringify(v),
    ),
  );
  if (Object.keys(patch).length)
    api(team, "PATCH", `/v9/projects/${wp.id}`, patch);
  ok(
    `Vercel project ${n.workflowProject} is connected to ${ctxRepo} (root workflows, Node 22; existing protection preserved)`,
  );

  // 7c. Turso from the marketplace
  let wenv = envNames(team, n.workflowProject);
  if (!wenv.has("TURSO_DATABASE_URL")) {
    todo("Creating a Turso database from the Vercel marketplace");
    const r = vercel(
      [
        "integration",
        "add",
        "tursocloud/database",
        "--name",
        n.contextRepo,
        "--plan",
        "starter",
        "-m",
        `region=${a.region || "iad1"}`,
        "-e",
        "production",
        "--no-env-pull",
        "--yes",
      ],
      { team, cwd: linkDir, allowFail: true },
    );
    wenv = envNames(team, n.workflowProject);
    if (!wenv.has("TURSO_DATABASE_URL")) {
      say(r.stdout + r.stderr);
      say(
        `\nTurso needs one human step on this team: run \`vercel integration accept-terms tursocloud --scope ${team}\` in a terminal, accept, then run this script again.`,
      );
      process.exit(2);
    }
    ok("Turso database connected");
  } else ok("Turso database already connected");

  // 7d. Secrets and settings, the same values on both projects
  const aenv2 = envNames(team, n.agentProject);
  const pair = (key, agentKey = key) => {
    const both = aenv2.has(agentKey) && wenv.has(key);
    if (both) return;
    const value = randomBytes(32).toString("hex");
    setEnv(team, n.workflowProject, key, value, { force: true });
    setEnv(team, n.agentProject, agentKey, value, { force: true });
    if (key === "GTM_RUN_SECRET")
      setEnv(team, n.workflowProject, "CRON_SECRET", value, { force: true });
  };
  pair("GTM_RUN_SECRET");
  pair("GTM_NOTIFY_SECRET");
  if (!wenv.has("CRON_SECRET"))
    say(
      "  note: CRON_SECRET was missing; run again with GTM_RUN_SECRET removed from both projects to rotate the pair",
    );
  if (!wenv.has("GTM_MODEL"))
    setEnv(
      team,
      n.workflowProject,
      "GTM_MODEL",
      a["workflow-model"] || "openai/gpt-5.6-luna",
      { secret: false },
    );
  setEnv(team, n.workflowProject, "GTM_AGENT_URL", agentUrl, {
    secret: false,
    force: true,
  });
  ok("Workflow project variables set");

  // Preserve machine access before protecting the private viewer. Active intake needs a configured sender bypass.
  const registryText = run("gh", [
    "api",
    `repos/${ctxRepo}/contents/workflows/workflows/index.ts`,
    "--jq",
    ".content",
  ]);
  if (
    registryText.status === 0 &&
    /\bintake\s*[:,}]/.test(
      Buffer.from(registryText.stdout.trim(), "base64").toString(),
    ) &&
    !a["intake-protection-verified"]
  )
    fail(
      "Active intake is registered. Verify each sender's deployment-gate credential, then rerun with --intake-protection-verified.",
    );
  // Existing projects must receive the compatible source upgrade before the gate changes.
  const agentSource = run("gh", [
    "api",
    `repos/${githubOwner}/${n.agentRepo}/contents/agent/lib/host.ts`,
    "--jq",
    ".content",
  ]);
  const workflowSource = run("gh", [
    "api",
    `repos/${ctxRepo}/contents/workflows/package.json`,
    "--jq",
    ".content",
  ]);
  const hostCode = Buffer.from(agentSource.stdout.trim(), "base64").toString();
  const runtimePackage = Buffer.from(
    workflowSource.stdout.trim(),
    "base64",
  ).toString();
  if (
    agentSource.status !== 0 ||
    workflowSource.status !== 0 ||
    !hostCode.includes("GTM_WORKFLOW_BYPASS_SECRET") ||
    !runtimePackage.includes("build:share")
  )
    fail(
      "Upgrade the agent host and workflow runtime source before enabling the protected viewer. Existing protection was preserved.",
    );
  const viewer = prepareViewer({
    team,
    workflowProject: n.workflowProject,
    agentProject: n.agentProject,
    owner: githubOwner,
    repo: n.contextRepo,
    shareProject: a["share-project"],
  });
  await waitForDeployment(team, deployFromGit(team, n.agentProject));
  activateViewer(team, n.workflowProject, viewer);

  // 7e. Deploy the workflow project and point the agent at it
  todo("Deploying the workflow project (about two minutes)");
  await waitForDeployment(team, deployFromGit(team, n.workflowProject));
  const wfUrl = productionUrl(team, n.workflowProject);
  setEnv(team, n.agentProject, "GTM_WORKFLOW_URL", wfUrl, {
    secret: false,
    force: true,
  });
  ok(`Workflow project live at ${wfUrl}`);
  todo("Redeploying the agent with the workflow connection");
  await waitForDeployment(team, deployFromGit(team, n.agentProject));
  ok("Agent redeployed");
  await waitForDeployment(team, deployFromGit(team, viewer.shareProject));
  enableSharing(team, n.workflowProject, viewer);
  await waitForDeployment(team, deployFromGit(team, n.workflowProject));
  ok("Scoped workflow sharing deployed");
}

// 8. Doctor
say("\nChecking everything:");
const healthy = print(await check({ slug, team, githubOwner, overrides: a }));

say(
  `\n${healthy ? "Done" : "Setup needs the checks above completed"}. In Slack: invite the app named ${n.agentProject} to your GTM channel, then say:\n  @${n.agentProject} set up our GTM workspace\n${a.channel ? "" : "Workflow notifications need a channel: add GTM_NOTIFY_CHANNEL (a channel id) on the agent project, or run again with --channel.\n"}`,
);
process.exit(healthy ? 0 : 1);
