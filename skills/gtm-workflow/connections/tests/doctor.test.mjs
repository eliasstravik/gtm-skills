import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { doctorHosted } from "../setup/deploy.mjs";
import { openJournal } from "../src/journal.mjs";
import { INTEGRATION_SCOPES } from "../src/vercel.mjs";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "connections-doctor-"));
  const state = { database: join(root, "journal.db") };
  const component = { digest: "b".repeat(64), sourceCommit: "a".repeat(40) };
  const production = { team: "example", teamId: "team", ownerId: "owner", projectId: "workflow", adminProjectId: "admin", integrationId: "integration", workflowName: "workspace-workflows", shareProject: "workspace-share", repository: "owner/workspace", runtimeOrigin: "https://workspace-workflows.vercel.app", origin: "https://workspace-connections.vercel.app" };
  const projects = {
    workflow: { id: "workflow", accountId: "team", ssoProtection: { deploymentType: "all" }, targets: { production: { alias: ["workspace-workflows.vercel.app"] } }, trustedSources: { projects: { share: { customAllow: [{ from: { slugs: ["production"] }, to: { slugs: ["production"] } }] } } } },
    admin: { id: "admin", accountId: "team", ssoProtection: { deploymentType: "all" }, targets: { production: { id: "manager-deployment", alias: ["workspace-connections.vercel.app"] } } },
    share: { id: "share", name: "workspace-share", accountId: "team", buildCommand: "npm run build:share", rootDirectory: "workflows", link: { org: "owner", repo: "workspace" }, targets: { production: { alias: ["workspace-share.vercel.app"] } } },
  };
  const configRow = (key, value) => ({ id: key, key, value, visibility: "config", type: "plain", target: ["production"] });
  const secretRow = (key) => ({ id: key, key, visibility: "secret", type: "sensitive", target: ["production"] });
  const envs = {
    workflow: [configRow("TURSO_DATABASE_URL", "libsql://workflow.example")],
    admin: [configRow("TURSO_DATABASE_URL", "libsql://administration.example"), configRow("CONNECTIONS_CLIENT_ID", "client"), configRow("CONNECTIONS_INSTALLATION_ID", "installation"), ...["CONNECTIONS_CLIENT_SECRET", "CONNECTIONS_INTEGRATION_TOKEN", "CONNECTIONS_SESSION_SECRET", "GTM_CONNECTIONS_READ_SECRET", "CONNECTIONS_RUNTIME_BYPASS", "TURSO_AUTH_TOKEN"].map(secretRow)],
    share: [configRow("GTM_VIEWER_PRIVATE_ORIGIN", production.runtimeOrigin), configRow("GTM_VIEWER_PRIVATE_PROJECT_ID", "workflow")],
  };
  const grant = { id: "installation", integrationId: "integration", userId: "owner", teamId: "team", projects: ["workflow"], scopes: [...INTEGRATION_SCOPES] };
  const api = async (method, path) => {
    assert.equal(method, "GET", "Doctor must never mutate configuration");
    if (path === "/v2/user") return { user: { id: "owner" } };
    if (path.includes("/members")) return { members: [{ uid: "owner", confirmed: true, role: "OWNER" }], pagination: { next: null } };
    if (path.includes("configuration/")) return grant;
    if (path.startsWith("/v9/projects?")) return { projects: Object.values(projects) };
    if (path.startsWith("/v9/projects/")) return projects[path.split("/").at(-1)];
    if (path.startsWith("/v10/projects/")) { assert.ok(path.endsWith("?decrypt=false")); return { envs: envs[path.split("/")[3]] }; }
    if (path.startsWith("/v13/deployments/")) return { projectId: "admin", readyState: "READY", meta: { gtmComponentDigest: component.digest, gtmSourceCommit: component.sourceCommit } };
    assert.fail(`Unexpected endpoint ${path}`);
  };
  const journal = await openJournal({ url: `file:${state.database}` });
  const verified = { deploymentId: "manager-deployment", runtimeDeploymentId: "workflow-deployment", runtimeCommit: "c".repeat(40) };
  await journal.set("bootstrap", { phase: "complete", installationId: "installation" });
  await journal.set("verified_setup", verified); await journal.set("live_deployments", {});
  const runtime = { deploymentId: verified.runtimeDeploymentId, commit: verified.runtimeCommit };
  return { root, state, config: { production, component }, projects, envs, grant, journal, runtime, options: { api, readRuntime: async () => runtime }, async close() { journal.close(); await rm(root, { recursive: true, force: true }); } };
}
test("Doctor requires verified current deployments and detects alias, grant, database, Secret and share boundary drift", async () => {
  const f = await fixture();
  const check = () => doctorHosted(f.state, f.config, f.options);
  try {
    assert.equal((await check()).status, "production_ready");
    f.runtime.deploymentId = "new-runtime";
    assert.equal((await check()).status, "verification_required"); f.runtime.deploymentId = "workflow-deployment";
    f.projects.admin.targets.production.alias = [];
    await assert.rejects(check(), /production_alias_unverified/); f.projects.admin.targets.production.alias = ["workspace-connections.vercel.app"];
    f.grant.projects.push("other-project"); await assert.rejects(check(), /installation_denied/); f.grant.projects.pop();
    f.envs.admin[0].value = f.envs.workflow[0].value;
    await assert.rejects(check(), /administration_database_not_isolated/); f.envs.admin[0].value = "libsql://administration.example";
    f.envs.admin.at(-1).visibility = "config";
    await assert.rejects(check(), /administrator_secret_storage_unverified/); f.envs.admin.at(-1).visibility = "secret";
    f.envs.share.push({ key: "BLITZ_API_KEY" });
    await assert.rejects(check(), /share_has_unexpected_configuration/); f.envs.share.pop();
    f.projects.workflow.trustedSources.projects.share.customAllow[0].from.slugs.push("preview");
    await assert.rejects(check(), /share_boundary_unverified/);
  } finally { await f.close(); }
});
