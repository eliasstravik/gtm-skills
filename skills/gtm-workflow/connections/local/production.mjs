import { spawn } from "node:child_process";
import { managedList, providerVariable, MANAGED_CONNECTIONS } from "../dist/catalog.mjs";
import { privateJson } from "./state.mjs";
import { ConnectionError, requireThat } from "../src/errors.mjs";

// Only what the Vercel CLI needs to find its login and the network. The launcher's environment holds every saved key.
const passed = /^(?:PATH|HOME|USER|LOGNAME|TMPDIR|TMP|TEMP|LANG|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_CACHE_HOME|APPDATA|LOCALAPPDATA|USERPROFILE|SYSTEMROOT|COMSPEC|PATHEXT|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|NODE_EXTRA_CA_CERTS)$/i;

/** `vercel api` as the owner, with the login the Vercel CLI keeps on this computer. Asynchronous, because the manager
 * shares its process with the viewer. A body (and so a key's value) goes through stdin, never the command line. */
export function ownerCli(team, command = "vercel") {
  requireThat(typeof team === "string" && /^[a-zA-Z0-9_-]+$/.test(team), "production_not_linked", 409);
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => passed.test(name)));
  return (method, path, body) => new Promise((resolve, reject) => {
    const args = ["api", path, "--method", method, "--raw", "--non-interactive", "--scope", team, ...(body === undefined ? [] : ["--input", "-"])];
    const child = spawn(command, args, { env, stdio: ["pipe", "pipe", "ignore"], shell: false, windowsHide: true });
    const chunks = []; let size = 0;
    const timer = setTimeout(() => child.kill(), 30000);
    const fail = () => reject(new ConnectionError(method === "GET" ? "production_unavailable" : "production_outcome_unknown", 503));
    child.once("error", () => { clearTimeout(timer); fail(); });
    child.stdout.on("data", (chunk) => { size += chunk.length; if (size > 4 * 1024 * 1024) child.kill(); else chunks.push(chunk); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return fail();
      // Some shells make the CLI print a hint line before the JSON.
      const text = Buffer.concat(chunks).toString().split("\n").filter((line) => !line.startsWith("<")).join("\n").trim();
      try { resolve(text ? JSON.parse(text) : null); } catch { fail(); }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function environment(api, projectId) {
  const result = await api("GET", `/v10/projects/${encodeURIComponent(projectId)}/env?decrypt=false`);
  requireThat(Array.isArray(result?.envs) && !result.pagination?.next, "production_unavailable", 503);
  const production = result.envs.filter((row) => typeof row?.key === "string" && Array.isArray(row.target) && row.target.includes("production"));
  // The marker is a plain variable, so its value (the list of names) comes back without decrypting anything.
  const markers = production.filter((row) => row.key === MANAGED_CONNECTIONS);
  requireThat(markers.length <= 1 && markers.every((row) => typeof row.id === "string" && row.type === "plain" && row.target.length === 1), "use_vercel_settings", 409);
  const marker = markers[0] ? { id: markers[0].id, names: managedList(markers[0].value) } : null;
  return { rows: production, marker };
}

/** Production as the local tab sees it: key names only. Values never come down. */
export function createProduction({ state, store, storage, api: suppliedApi }) {
  async function link() {
    const p = (await privateJson(state.configPath))?.production;
    if (!p?.projectId || !p.team || !p.origin) return null;
    return { projectId: p.projectId, name: p.workflowName ?? p.projectId, origin: p.origin, api: suppliedApi ?? ownerCli(p.team) };
  }
  /** Names saved through production's Connections tab (GTM_CONNECTIONS_MANAGED) that exist as production variables. */
  async function names() {
    const p = await link();
    if (!p) return { linked: false };
    const { rows, marker } = await environment(p.api, p.projectId);
    const present = new Set(rows.map((row) => row.key));
    return { linked: true, project: p.name, url: `${p.origin}/connections`, names: (marker?.names ?? []).filter((name) => present.has(name)) };
  }
  async function redeploy(api, p, id) {
    try {
      const [project, alias] = await Promise.all([api("GET", `/v9/projects/${encodeURIComponent(p.projectId)}`), api("GET", `/v4/aliases/${encodeURIComponent(new URL(p.origin).hostname)}`)]);
      requireThat(project?.id === p.projectId && typeof project.name === "string" && alias?.projectId === p.projectId && typeof alias.deployment?.id === "string", "application_unavailable", 503);
      // The code production serves now, rebuilt with the new environment; never a newer commit. The meta lets the
      // hosted tab follow this deployment like one it started.
      const result = await api("POST", "/v13/deployments?forceNew=1", { name: project.name, project: p.projectId, deploymentId: alias.deployment.id,
        target: "production", withLatestCommit: false, meta: { gtmConnectionsChange: id } });
      return typeof result?.id === "string" && !["ERROR", "CANCELED"].includes(result.readyState) ? "applying" : "failed";
    } catch { return "failed"; }
  }
  /** Sends one key saved on this computer to production as a sensitive, production-only variable and lists its name in
   * GTM_CONNECTIONS_MANAGED, then redeploys. An existing production key is replaced only with `replace: true`. */
  async function push(body) {
    requireThat(body && Object.keys(body).every((key) => ["id", "variable", "replace"].includes(key)), "unknown_field");
    requireThat(typeof body.id === "string" && /^[0-9a-f-]{36}$/.test(body.id), "invalid_operation");
    requireThat(providerVariable(body.variable), "invalid_provider_variable");
    requireThat(body.replace === undefined || typeof body.replace === "boolean", "invalid_change");
    const p = await link(); requireThat(p, "production_not_linked", 409);
    const saved = (await storage.list()).find((row) => row.variable === body.variable);
    requireThat(saved?.state === "saved", "local_key_not_saved", 409);
    const { rows, marker } = await environment(p.api, p.projectId), existing = rows.filter((row) => row.key === body.variable);
    requireThat(existing.length <= 1, "use_vercel_settings", 409);
    const row = existing[0];
    requireThat(!row || body.replace === true, "production_key_exists", 409);
    // Shared, integration and multi-environment variables keep their settings; those are changed in Vercel.
    requireThat(!row || (typeof row.id === "string" && row.target.length === 1 && !row.configurationId && !row.integrationId && !row.sharedEnvVariableId && !row.system), "use_vercel_settings", 409);
    const base = `/v9/projects/${encodeURIComponent(p.projectId)}/env/`;
    const names = new Set(marker?.names ?? []);
    // Listed before the key exists, as the hosted tab does: a failed write leaves a name without a variable, which lists nothing.
    if (!names.has(body.variable)) {
      names.add(body.variable);
      const listed = { value: JSON.stringify([...names].sort()), type: "plain", target: ["production"], comment: "Keys saved through Connections" };
      await (marker ? p.api("PATCH", base + encodeURIComponent(marker.id), listed) : p.api("POST", `/v10/projects/${encodeURIComponent(p.projectId)}/env`, { ...listed, key: MANAGED_CONNECTIONS }));
    }
    const value = store.loadForRuntime(body.variable);
    requireThat(typeof value === "string" && value.trim().length > 0, "saved_credential_missing", 503);
    const write = { value, type: "sensitive", visibility: "secret", target: ["production"], comment: saved.label ?? row?.comment ?? body.variable };
    try {
      await (row ? p.api("PATCH", base + encodeURIComponent(row.id), write) : p.api("POST", `/v10/projects/${encodeURIComponent(p.projectId)}/env`, { ...write, key: body.variable }));
    } finally { write.value = undefined; }
    return { pushed: true, replaced: Boolean(row), application: await redeploy(p.api, p, body.id), url: `${p.origin}/connections` };
  }
  return { names, push };
}
