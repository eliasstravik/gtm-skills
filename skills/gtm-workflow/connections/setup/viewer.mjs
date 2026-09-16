import { ensureProject } from "./resources.mjs";
import { safeEnvironment } from "./cli.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
import { verifyOwner } from "./bootstrap.mjs";
import { requireThat } from "../src/errors.mjs";

/** Sharing has only two public routing settings and its isolated build mode. */
export async function prepareSharing({ api, fixed, workflow, owner, repo, runtimeOrigin, journal }) {
  await verifyOwner(api, fixed);
  const share = await ensureProject({ api, journal, teamId: fixed.teamId, definition: {
    name: `${workflow.name}-share`, framework: "nitro", rootDirectory: "workflows", buildCommand: "npm run build:share",
    gitRepository: { type: "github", repo: `${owner}/${repo}` }, ssoProtection: null,
  } });
  const allowed = new Set(["GTM_VIEWER_PRIVATE_ORIGIN", "GTM_VIEWER_PRIVATE_PROJECT_ID"]);
  const env = await safeEnvironment(api, share.id);
  requireThat(env.every((row) => allowed.has(row.key)), "share_has_unexpected_configuration", 409);
  await api("PATCH", `/v9/projects/${share.id}`, { rootDirectory: "workflows", framework: "nitro", buildCommand: "npm run build:share",
    nodeVersion: "22.x", autoExposeSystemEnvs: true, previewDeploymentsDisabled: true });
  for (const [key, value] of [["GTM_VIEWER_PRIVATE_ORIGIN", runtimeOrigin], ["GTM_VIEWER_PRIVATE_PROJECT_ID", workflow.id]]) {
    await writeSetupConfiguration({ api, journal, projectId: share.id, key, value, secret: false });
  }
  // Preserve unrelated trusted sources. This share may reach only Production.
  const current = await api("GET", `/v9/projects/${workflow.id}`);
  const trustedSources = { ...current.trustedSources, projects: { ...current.trustedSources?.projects,
    [share.id]: { label: "Workflow scoped sharing", customAllow: [{ from: { slugs: ["production"] }, to: { slugs: ["production"] } }] } } };
  await api("PATCH", `/v9/projects/${workflow.id}`, { trustedSources });
  return api("GET", `/v9/projects/${share.id}`);
}
