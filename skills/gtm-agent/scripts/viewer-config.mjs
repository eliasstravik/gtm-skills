import { randomBytes } from "node:crypto";
import { api, project, envNames, setEnv, fail, productionUrl } from "./lib.mjs";
export const privateProtection = { deploymentType: "all" };
export function trustShare(existing, shareId) {
  return {
    ...existing,
    projects: {
      ...existing?.projects,
      [shareId]: {
        label: "Workflow scoped sharing",
        customAllow: [
          { from: { slugs: ["production"] }, to: { slugs: ["production"] } },
        ],
      },
    },
  };
}
export function protectionHealthy(p) {
  return p.ssoProtection?.deploymentType === "all";
}
export function shareConfigurationHealthy(privateProject, shareProject) {
  const rules =
    privateProject.trustedSources?.projects?.[shareProject.id]?.customAllow;
  return (
    shareProject.accountId === privateProject.accountId &&
    shareProject.rootDirectory === "workflows" &&
    shareProject.buildCommand === "npm run build:share" &&
    rules?.length === 1 &&
    rules[0].from?.slugs?.length === 1 &&
    rules[0].from.slugs[0] === "production" &&
    rules[0].to?.slugs?.length === 1 &&
    rules[0].to.slugs[0] === "production"
  );
}
/** Prepare gate access first. Never disables protection or rotates an existing agent credential. */
export function prepareViewer({
  team,
  workflowProject,
  agentProject,
  owner,
  repo,
  shareProject = workflowProject + "-share",
}) {
  const wp = project(team, workflowProject);
  if (!wp) fail("Workflow project does not exist.");
  const agentEnv = envNames(team, agentProject);
  if (!agentEnv.has("GTM_WORKFLOW_BYPASS_SECRET")) {
    const secret = randomBytes(16).toString("hex");
    api(team, "PATCH", `/v10/projects/${wp.id}/protection-bypass`, {
      generate: { secret, note: "GTM agent workflow access" },
    });
    setEnv(team, agentProject, "GTM_WORKFLOW_BYPASS_SECRET", secret);
  }
  setEnv(team, agentProject, "GTM_WORKFLOW_GATE_REQUIRED", "1", {
    secret: false,
    force: true,
  });
  let share = project(team, shareProject);
  if (!share) {
    share = api(team, "POST", "/v10/projects", {
      name: shareProject,
      framework: "nitro",
      rootDirectory: "workflows",
      buildCommand: "npm run build:share",
      gitRepository: { type: "github", repo: `${owner}/${repo}` },
      ssoProtection: null,
    });
  }
  if (share.link?.org !== owner || share.link?.repo !== repo)
    fail("Sharing project is connected to a different repository.");
  const names = envNames(team, shareProject);
  if (
    [...names].some((n) =>
      /^(TURSO_|GTM_RUN_SECRET$|CRON_SECRET$|GTM_GITHUB_TOKEN$)/.test(n),
    )
  )
    fail(
      "Sharing project contains private runtime credentials. Remove those credentials before deploying it.",
    );
  api(team, "PATCH", `/v9/projects/${share.id}`, {
    rootDirectory: "workflows",
    buildCommand: "npm run build:share",
    nodeVersion: "22.x",
    autoExposeSystemEnvs: true,
    previewDeploymentsDisabled: true,
  });
  const origin =
    productionUrl(team, workflowProject) ??
    `https://${workflowProject}.vercel.app`;
  setEnv(team, shareProject, "GTM_VIEWER_PRIVATE_ORIGIN", origin, {
    secret: false,
    force: true,
  });
  setEnv(team, shareProject, "GTM_VIEWER_PRIVATE_PROJECT_ID", wp.id, {
    secret: false,
    force: true,
  });
  api(team, "PATCH", `/v9/projects/${wp.id}`, {
    trustedSources: trustShare(wp.trustedSources, share.id),
  });
  return {
    privateProjectId: wp.id,
    shareProject,
    shareProjectId: share.id,
    shareOrigin:
      productionUrl(team, shareProject) ?? `https://${shareProject}.vercel.app`,
  };
}
export function activateViewer(team, workflowProject, prepared) {
  const wp = project(team, workflowProject);
  api(team, "PATCH", `/v9/projects/${wp.id}`, {
    ssoProtection: privateProtection,
  });
  if (!protectionHealthy(project(team, workflowProject)))
    fail("Vercel Authentication on All Deployments was not confirmed.");
  setEnv(team, workflowProject, "GTM_VIEWER_PROTECTED", "1", {
    secret: false,
    force: true,
  });
}
export function enableSharing(team, workflowProject, prepared) {
  const privateProject = project(team, workflowProject),
    share = project(team, prepared.shareProject);
  if (
    !protectionHealthy(privateProject) ||
    !share ||
    !shareConfigurationHealthy(privateProject, share) ||
    !productionUrl(team, prepared.shareProject)
  )
    fail(
      "Private protection and deployed sharing configuration must be verified before enabling Share.",
    );
  setEnv(
    team,
    workflowProject,
    "GTM_VIEWER_SHARE_ORIGIN",
    prepared.shareOrigin,
    { secret: false, force: true },
  );
}
