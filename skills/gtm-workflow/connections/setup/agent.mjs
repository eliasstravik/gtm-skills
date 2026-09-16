import { captured, safeEnvironment } from "./cli.mjs";
import { writeSetupConfiguration } from "./configuration.mjs";
import { verifyOwner } from "./bootstrap.mjs";
import { requireThat } from "../src/errors.mjs";

export async function prepareAgent({ api, fixed, workflow, agent, agentRepository, journal, secret, runtimeOrigin, run = captured }) {
  await verifyOwner(api, fixed);
  requireThat(agent.accountId === fixed.teamId && agent.link?.type === "github" && `${agent.link.org}/${agent.link.repo}`.toLowerCase() === agentRepository.toLowerCase(), "agent_project_binding_denied", 403);
  const commit = agent.targets?.production?.meta?.githubCommitSha;
  requireThat(typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit), "agent_source_unverified", 409);
  const prior = await journal.get("agent_binding");
  requireThat(!prior || prior.projectId === agent.id && prior.repository === agentRepository, "agent_project_binding_denied", 403);
  const host = JSON.parse(run("gh", ["api", `repos/${agentRepository}/contents/agent/lib/host.ts?ref=${commit}`]));
  requireThat(typeof host.content === "string" && Buffer.from(host.content, "base64").toString().includes("GTM_WORKFLOW_BYPASS_SECRET"), "upgrade_agent_before_protection", 409);
  await journal.set("agent_binding", { projectId: agent.id, repository: agentRepository });
  const workflowNames = new Set((await safeEnvironment(api, workflow.id)).filter((row) => row.target?.includes("production")).map((row) => row.key));
  const agentNames = new Set((await safeEnvironment(api, agent.id)).filter((row) => row.target?.includes("production")).map((row) => row.key));
  const configure = async (projectId, key, value, options = {}) => {
    await verifyOwner(api, fixed);
    return writeSetupConfiguration({ api, journal, projectId, key, value, ...options });
  };
  for (const [key, localName] of [["GTM_RUN_SECRET", "MACHINE_RUN_SECRET"], ["GTM_NOTIFY_SECRET", "NOTIFY_SECRET"]]) {
    if (workflowNames.has(key) && agentNames.has(key)) continue;
    const own = await journal.get(`configuration:${workflow.id}:${key}`) ?? await journal.get(`configuration:${agent.id}:${key}`);
    requireThat((!workflowNames.has(key) && !agentNames.has(key)) || own?.phase === "saved", "agent_secret_pair_requires_reconciliation", 409);
    const value = await secret(localName);
    await configure(workflow.id, key, value);
    await configure(agent.id, key, value);
    if (key === "GTM_RUN_SECRET" && !workflowNames.has("CRON_SECRET")) await configure(workflow.id, "CRON_SECRET", value);
  }
  if (!agentNames.has("GTM_WORKFLOW_BYPASS_SECRET")) {
    const bypass = await secret("AGENT_WORKFLOW_BYPASS"), gate = await api("GET", `/v9/projects/${workflow.id}`);
    if (!Object.hasOwn(gate.protectionBypass ?? {}, bypass)) {
      requireThat(!await journal.get("agent_bypass_attempt"), "agent_bypass_unresolved", 409);
      await journal.set("agent_bypass_attempt", true);
      try { await api("PATCH", `/v10/projects/${workflow.id}/protection-bypass`, { generate: { secret: bypass, note: "GTM agent workflow access" } }); } catch { /* Confirm the exact generated value below. */ }
      const after = await api("GET", `/v9/projects/${workflow.id}`);
      requireThat(Object.hasOwn(after.protectionBypass ?? {}, bypass), "agent_bypass_unresolved", 409);
    }
    await configure(agent.id, "GTM_WORKFLOW_BYPASS_SECRET", bypass);
  }
  await configure(agent.id, "GTM_WORKFLOW_GATE_REQUIRED", "1", { secret: false });
  await configure(agent.id, "GTM_WORKFLOW_URL", runtimeOrigin, { secret: false });
  const aliases = agent.targets?.production?.alias ?? [];
  const alias = aliases.find((name) => name === `${agent.name}.vercel.app`) ?? aliases[0];
  requireThat(typeof alias === "string" && /^[a-zA-Z0-9.-]+$/.test(alias), "deploy_agent_before_workflow_setup", 409);
  if (!workflowNames.has("GTM_AGENT_URL")) await configure(workflow.id, "GTM_AGENT_URL", `https://${alias}`, { secret: false });
  return api("GET", `/v9/projects/${agent.id}`);
}
