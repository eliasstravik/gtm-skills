#!/usr/bin/env node
import { parseArgs } from "node:util";
import { workspaceState, privateJson } from "../connections/local/state.mjs";
import { componentDigest } from "../connections/local/install.mjs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { safeError, requireThat } from "../connections/src/errors.mjs";
try {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, target: { type: "string", default: "local" }, json: { type: "boolean" } } });
  requireThat(values.workspace, "workspace_required");
  const state = await workspaceState(values.workspace), config = await privateJson(state.configPath);
  requireThat(config?.component && await componentDigest(config.component.path) === config.component.digest, "component_digest_mismatch", 403);
  if (values.target === "production") {
    const { doctorHosted } = await import(pathToFileURL(join(config.component.path, "setup/deploy.mjs")));
    console.log(JSON.stringify(await doctorHosted(state, config)));
  } else {
    const { nativeStore } = await import(pathToFileURL(join(config.component.path, "local/storage.mjs")));
    const store = nativeStore(state.id);
    requireThat(Boolean(store.loadForRuntime("GTM_CONNECTIONS_READ_SECRET")), "run_local_setup", 409);
    console.log(JSON.stringify({ status: "local_ready", workspace: state.workspace, credentialStore: process.platform === "linux" ? "Secret Service" : process.platform === "darwin" ? "Keychain" : "Windows Credential Manager", component: config.component.version }));
  }
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
