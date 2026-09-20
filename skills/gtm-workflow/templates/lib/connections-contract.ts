/** Safe connection metadata shared with the local manager. */
export const CONNECTIONS_VERSION = 1;
export type ConnectionUsage = { connection: string; provider?: string };
export type ConnectionWorkflow = { id: string; title: string; connections?: ConnectionUsage[] };
// PGHOST, PGUSER, PGPASSWORD and the rest carry no underscore; the Neon integration injects them and node-postgres reads them as defaults.
const reserved = /^(?:PG[A-Z]|(?:GTM|VERCEL|NEXT|NEXT_PUBLIC|PUBLIC|VITE|NUXT|REACT_APP|DATABASE|POSTGRES|MYSQL|REDIS|KV|AWS|AZURE|GOOGLE_CLOUD|SUPABASE|CLERK|AUTH|SESSION|CRON|WORKFLOW|NITRO|H3|BASH|NODE|NPM|PNPM|YARN|BUN|DENO|LD|DYLD|PYTHON|XDG|SSL|OPENSSL|GIT|SSH|CI|SLACK_CONNECTOR)_)/i;
const system = /^(?:PATH|HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|TMPDIR|TMP|TEMP|LANG|LC_ALL|TERM|COLORTERM|PORT|HOST|HOSTNAME|SYSTEMROOT|APPDATA|LOCALAPPDATA|USERPROFILE|COMSPEC|PATHEXT|CI|SLACK_CONNECTOR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|TZ|IFS|ENV|BASH_ENV)$/i;
export function providerVariable(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(name) && !reserved.test(name) && !system.test(name);
}
export function connectionLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}
export function credentialVariable(name: string) {
  return providerVariable(name) && /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name);
}
export function connectionDefinition(variable: string) {
  return { id: variable, name: variable, variables: [variable] };
}
export function validateUsage(value: unknown): ConnectionUsage[] {
  if (!Array.isArray(value) || value.length > 100) throw Error("Invalid declared connections");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Object.keys(item).some((key) => !["connection", "provider"].includes(key)) ||
      typeof item.connection !== "string" || !/^[A-Za-z_][A-Za-z0-9_-]{0,255}$/.test(item.connection) ||
      (item.provider !== undefined && (typeof item.provider !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,63}$/.test(item.provider))))
      throw Error("Invalid declared connections");
    return { connection: item.connection, ...(item.provider === undefined ? {} : { provider: item.provider }) };
  });
}
export function runtimeLabels(env: Record<string, string | undefined>): Record<string, string> {
  try {
    const labels = JSON.parse(env.GTM_CONNECTIONS_LABELS ?? "{}");
    return Object.fromEntries(Object.entries(labels).filter(([key, label]) => providerVariable(key) && connectionLabel(label))) as Record<string, string>;
  } catch { return {}; }
}
export function configuredNames(env: Record<string, string | undefined>) {
  const labels = runtimeLabels(env);
  return Object.keys(env).filter((name) => (credentialVariable(name) || Object.hasOwn(labels, name)) && Boolean(env[name]?.trim())).sort();
}
export function connectionInventory(names: string[], workflows: ConnectionWorkflow[], platformIdentity = false, labels: Record<string, string> = {}) {
  const rows = [...new Set(names.filter(providerVariable))].sort().map((variable) => {
    // Accept prior workflow declarations while new declarations use the exact variable.
    const legacy = variable.replace(/_API_KEY$/, "").toLowerCase().replaceAll("_", "-");
    const usage = workflows.flatMap((workflow) => (workflow.connections ?? []).filter((use) => use.connection === variable || use.connection === legacy).map((use) => ({
      workflowId: workflow.id, title: workflow.title, ...(use.provider ? { provider: use.provider } : {}),
    })));
    return { id: variable, name: (typeof labels[variable] === "string" ? labels[variable].trim() : "") || variable, fields: [{ variable, present: true }], configured: true,
      platformIdentity: false, usage, usageComplete: workflows.every((workflow) => workflow.connections !== undefined) };
  });
  if (platformIdentity) rows.push({ id: "ai-gateway", name: "AI Gateway", fields: [], configured: true, platformIdentity: true,
    usage: workflows.flatMap((workflow) => (workflow.connections ?? []).filter((use) => ["ai-gateway", "AI_GATEWAY_API_KEY"].includes(use.connection)).map((use) => ({
      workflowId: workflow.id, title: workflow.title, ...(use.provider ? { provider: use.provider } : {}),
    }))), usageComplete: workflows.every((workflow) => workflow.connections !== undefined) });
  return rows;
}
