import { createRequire } from "node:module";
import { readFile, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { ConnectionError, requireThat } from "../src/errors.mjs";
export { inspectionEnvironment } from "./inspection-environment.mjs";

export async function settings(workspace, inherited = process.env) {
  const result = {};
  for (const name of [".env", ".env.local"]) {
    const path = join(workspace, "workflows", name);
    try {
      const stat = await lstat(path); requireThat(stat.isFile() && !stat.isSymbolicLink(), "unsafe_credential_file", 403);
      Object.assign(result, parseEnv(await readFile(path, "utf8")));
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return { ...result, ...inherited };
}
export function nativeStore(workspaceId) {
  const { Entry } = createRequire(new URL("./package.json", import.meta.url))("@napi-rs/keyring");
  const entry = (variable) => new Entry(`gtm-connections/${workspaceId}/local`, variable, { linux: { store: "secret-service" } });
  return {
    set(variable, value) { try { entry(variable).setPassword(value); } catch { throw new ConnectionError("unlock_os_credential_store", 503); } },
    remove(variable) { try { return entry(variable).deleteCredential(); } catch { throw new ConnectionError("unlock_os_credential_store", 503); } },
    loadForRuntime(variable) { try { return entry(variable).getPassword(); } catch { throw new ConnectionError("unlock_os_credential_store", 503); } },
  };
}
export function localStorage({ journal, store, environment }) {
  return {
    async list() {
      // Only keys saved through this page. Environment variables are never listed, whatever their names; one that
      // shares a saved key's name is shown as that key's external copy.
      const meta = await journal.list(), operations = await journal.operations();
      const names = new Set([...meta.map((row) => row.variable), ...operations.map((row) => row.variable)]);
      return [...names].sort().map((variable) => {
        const row = meta.find((item) => item.variable === variable);
        const op = operations.find((item) => item.variable === variable);
        return { variable, label: row?.label, state: op && ["prepared", "write_attempted", "unresolved"].includes(op.phase) ? "unresolved" : row?.state ?? "external",
          version: row ? String(row.generation) : op ? `operation:${op.id}` : "external", editable: true, externalCopy: Boolean(environment[variable]?.trim()) };
      });
    },
    async write(input) {
      if (input.action === "disconnect") await store.remove(input.variable);
      else if (input.value !== undefined) await store.set(input.variable, input.value);
      return null;
    },
  };
}
export async function runtimeEnvironment({ journal, store, environment }) {
  const result = { ...environment }, meta = await journal.list();
  const pending = (await journal.operations()).filter((op) => !op.superseded_by && ["prepared", "write_attempted", "unresolved"].includes(op.phase));
  requireThat(pending.length === 0, "resolve_connection_before_restart", 409);
  for (const row of meta) {
    delete result[row.variable];
    if (row.state === "disconnected") continue;
    const value = await store.loadForRuntime(row.variable);
    requireThat(typeof value === "string" && Boolean(value.trim()), "saved_credential_missing", 503);
    result[row.variable] = value;
  }
  result.GTM_CONNECTIONS_LABELS = JSON.stringify(Object.fromEntries(meta.filter((row) => row.state !== "disconnected").map((row) => [row.variable, row.label || row.variable])));
  result.GTM_CONNECTIONS_GENERATION = String(Math.max(0, ...meta.map((row) => Number(row.generation))));
  return result;
}
