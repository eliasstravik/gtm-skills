#!/usr/bin/env node
import { parseArgs } from "node:util";
import { workspaceState, privateJson } from "../connections/local/state.mjs";
import { componentDigest } from "../connections/local/install.mjs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { safeError, requireThat } from "../connections/src/errors.mjs";
import { rootFileDrift } from "./root-files.mjs";
import { shareFirewallDrift, teamSpendCap } from "./share-firewall.mjs";
try {
  const { values } = parseArgs({ options: { workspace: { type: "string" }, target: { type: "string", default: "local" }, json: { type: "boolean" } } });
  requireThat(values.workspace, "workspace_required");
  const state = await workspaceState(values.workspace), config = await privateJson(state.configPath);
  requireThat(config?.component && await componentDigest(config.component.path) === config.component.digest, "component_digest_mismatch", 403);
  if (values.target === "production") {
    const { doctorHosted } = await import(pathToFileURL(join(config.component.path, "setup/private-project.mjs")));
    const result = await doctorHosted(state, config), { team, workflowName } = config.production;
    // Missing or changed share rate limits are drift that hosted setup repairs; a missing spend cap is a team setting, so only a warning.
    const shareFirewall = shareFirewallDrift({ project: `${workflowName}-share`, team }), spendCap = teamSpendCap({ team });
    console.log(JSON.stringify({ ...result, rootFiles: await rootFileDrift(state.workspace), shareFirewall, spendCap }));
    process.exitCode = result.status === "production_ready" && ["current", "no_share_project"].includes(shareFirewall.status) ? 0 : 2;
  } else {
    const { nativeStore } = await import(pathToFileURL(join(config.component.path, "local/storage.mjs")));
    const store = nativeStore(state.id);
    requireThat(Boolean(store.loadForRuntime("GTM_CONNECTIONS_READ_SECRET")), "run_local_setup", 409);
    console.log(JSON.stringify({ status: "local_ready", workspace: state.workspace, credentialStore: process.platform === "linux" ? "Secret Service" : process.platform === "darwin" ? "Keychain" : "Windows Credential Manager", component: config.component.version, rootFiles: await rootFileDrift(state.workspace) }));
  }
} catch (error) { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; }
