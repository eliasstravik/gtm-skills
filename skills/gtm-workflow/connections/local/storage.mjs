import { createRequire } from "node:module";
import { readFile, lstat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { configuredNames } from "../dist/catalog.mjs";
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
      const meta = await journal.list(), operations = await journal.operations();
      const external = configuredNames(environment);
      const names = new Set([...external, ...meta.map((row) => row.variable), ...operations.map((row) => row.variable)]);
      return [...names].sort().map((variable) => {
        const row = meta.find((item) => item.variable === variable);
        const op = operations.find((item) => item.variable === variable);
        return { variable, label: row?.label, state: op && ["prepared", "write_attempted", "unresolved"].includes(op.phase) ? "unresolved" : row?.state ?? "external",
          version: row ? String(row.generation) : op ? `operation:${op.id}` : "external", editable: true, externalCopy: external.includes(variable) };
      });
    },
    async write(input) {
      if (input.action === "disconnect") await store.remove(input.variable);
      else await store.set(input.variable, input.value);
      return null;
    },
  };
}
export async function runtimeEnvironment({ journal, store, environment }) {
  const result = { ...environment }, meta = await journal.list();
  const pending = (await journal.operations()).filter((op) => ["prepared", "write_attempted", "unresolved"].includes(op.phase));
  requireThat(!pending.some((op) => !meta.some((row) => row.variable === op.variable && Number(row.updated_at) > Number(op.updated_at))), "resolve_connection_before_restart", 409);
  for (const row of meta) {
    delete result[row.variable];
    if (row.state === "disconnected") continue;
    const value = await store.loadForRuntime(row.variable);
    requireThat(typeof value === "string" && Boolean(value.trim()), "saved_credential_missing", 503);
    result[row.variable] = value;
  }
  result.GTM_CONNECTIONS_GENERATION = String(Math.max(0, ...meta.map((row) => Number(row.generation))));
  return result;
}
