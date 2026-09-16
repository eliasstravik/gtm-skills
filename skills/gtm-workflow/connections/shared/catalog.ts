/** Safe metadata only. This module is shared with the separately built manager. */
export const CONNECTIONS_VERSION = 1;
export const services = [
  { id: "monid", name: "Monid", variables: ["MONID_API_KEY"] },
  { id: "blitz", name: "Blitz", variables: ["BLITZ_API_KEY"] },
  { id: "apollo", name: "Apollo", variables: ["APOLLO_API_KEY"] },
  { id: "ai-gateway", name: "AI Gateway", variables: ["AI_GATEWAY_API_KEY"] },
] as const;
export type ConnectionUsage = { connection: string; provider?: string };
export type ConnectionWorkflow = { id: string; title: string; connections?: ConnectionUsage[] };
const reserved = /^(?:GTM|VERCEL|NEXT_PUBLIC|PUBLIC|VITE|NUXT_PUBLIC|REACT_APP|DATABASE|TURSO|POSTGRES|MYSQL|REDIS|KV|AWS|AZURE|GOOGLE_CLOUD|SUPABASE|CLERK|AUTH|SESSION|CRON)_/;
export function providerVariable(name: unknown): name is string {
  return typeof name === "string" && /^[A-Z][A-Z0-9_]{1,63}_API_KEY$/.test(name) && !reserved.test(name);
}
export function connectionDefinition(variable: string) {
  const known = services.find((service) => (service.variables as readonly string[]).includes(variable));
  return known ?? {
    id: variable.slice(0, -8).toLowerCase().replaceAll("_", "-"),
    name: variable.slice(0, -8).toLowerCase().split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "),
    variables: [variable],
  };
}
export function validateUsage(value: unknown): ConnectionUsage[] {
  if (!Array.isArray(value) || value.length > 100) throw Error("Invalid declared connections");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["connection", "provider"].includes(key)) ||
      typeof item.connection !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.connection) ||
      (item.provider !== undefined && (typeof item.provider !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,63}$/.test(item.provider))))
      throw Error("Invalid declared connections");
    return { connection: item.connection, ...(item.provider === undefined ? {} : { provider: item.provider }) };
  });
}
export function configuredNames(env: Record<string, string | undefined>) {
  return Object.keys(env).filter((name) => providerVariable(name) && Boolean(env[name]?.trim())).sort();
}
export function connectionInventory(names: string[], workflows: ConnectionWorkflow[], platformIdentity = false) {
  const ids = new Set(names.filter(providerVariable).map((name) => connectionDefinition(name).id));
  for (const workflow of workflows) for (const use of workflow.connections ?? []) ids.add(use.connection);
  if (platformIdentity) ids.add("ai-gateway");
  return [...ids].sort().map((id) => {
    const fields = names.filter((name) => providerVariable(name) && connectionDefinition(name).id === id);
    const known = services.find((service) => service.id === id);
    const usage = workflows.flatMap((workflow) => (workflow.connections ?? []).filter((use) => use.connection === id).map((use) => ({
      workflowId: workflow.id, title: workflow.title, ...(use.provider ? { provider: use.provider } : {}),
    })));
    return { id, name: known?.name ?? (fields[0] ? connectionDefinition(fields[0]).name : id),
      fields: fields.map((variable) => ({ variable, present: true })),
      configured: fields.length > 0 || (id === "ai-gateway" && platformIdentity),
      platformIdentity: id === "ai-gateway" && platformIdentity,
      usage, usageComplete: workflows.every((workflow) => workflow.connections !== undefined),
    };
  });
}
