import { providerVariable } from "../dist/catalog.mjs";
import { requireThat } from "./errors.mjs";

const text = (value, limit = 256) => typeof value === "string" && value.length <= limit && !/[\u0000-\u001f]/.test(value);
const optional = (value) => value === null || value === undefined || text(value);
// Runtime responses cross a trust boundary. Never spread response objects into a
// browser/CLI DTO, even when a trusted runtime normally produces those objects.
export function runtimeSnapshot(raw) {
  requireThat(raw?.version === 1 && text(raw.workspace) && ["local", "production"].includes(raw.environment) &&
    optional(raw.deploymentId) && optional(raw.commit) && optional(raw.generation) && optional(raw.processGeneration) &&
    Array.isArray(raw.connections) && raw.connections.length <= 500, "invalid_runtime_metadata", 503);
  const ids = new Set();
  const connections = raw.connections.map((row) => {
    requireThat(row && typeof row.id === "string" && /^[A-Za-z_][A-Za-z0-9_-]{0,255}$/.test(row.id) && !ids.has(row.id) &&
      text(row.name, 500) && typeof row.configured === "boolean" && typeof row.platformIdentity === "boolean" &&
      typeof row.usageComplete === "boolean" && Array.isArray(row.fields) && row.fields.length <= 100 &&
      Array.isArray(row.usage) && row.usage.length <= 1000, "invalid_runtime_metadata", 503);
    ids.add(row.id);
    const fields = row.fields.map((field) => {
      requireThat(providerVariable(field?.variable) && typeof field.present === "boolean", "invalid_runtime_metadata", 503);
      return { variable: field.variable, present: field.present };
    });
    const usage = row.usage.map((use) => {
      requireThat(use && text(use.workflowId, 100) && text(use.title, 200) &&
        (use.provider === undefined || text(use.provider, 64)), "invalid_runtime_metadata", 503);
      return { workflowId: use.workflowId, title: use.title, ...(use.provider === undefined ? {} : { provider: use.provider }) };
    });
    return { id: row.id, name: row.name, configured: row.configured, platformIdentity: row.platformIdentity,
      usageComplete: row.usageComplete, fields, usage };
  });
  return { version: 1, workspace: raw.workspace, environment: raw.environment,
    deploymentId: raw.deploymentId ?? null, commit: raw.commit ?? null, generation: raw.generation ?? null,
    processGeneration: raw.processGeneration ?? null, connections };
}
