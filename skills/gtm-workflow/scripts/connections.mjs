#!/usr/bin/env node
import { parseArgs } from "node:util";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { request as httpRequest } from "node:http";
import { workspaceState, privateJson } from "../connections/local/state.mjs";
import { componentDigest } from "../connections/local/install.mjs";
import { requireThat, safeError } from "../connections/src/errors.mjs";
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { workspace: { type: "string" }, target: { type: "string", default: "local" }, json: { type: "boolean" } } });
  requireThat(values.workspace && ["open", "list"].includes(positionals[0]) && ["local", "production"].includes(values.target), "invalid_connections_command");
  const state = await workspaceState(resolve(values.workspace)), config = await privateJson(state.configPath);
  requireThat(config?.component && await componentDigest(config.component.path) === config.component.digest, "component_digest_mismatch", 403);
  if (values.target === "production") {
    const { productionCommand } = await import(pathToFileURL(join(config.component.path, "setup/production-command.mjs")));
    console.log(JSON.stringify(await productionCommand(positionals[0], state, config))); return;
  }
  const { startLocal } = await import(pathToFileURL(join(config.component.path, "local/server.mjs")));
  if (positionals[0] === "list") {
    const current = await privateJson(join(state.directory, "manager.json"));
    let alive = false; if (current) try { process.kill(current.pid, 0); alive = true; } catch {}
    if (alive) {
      requireThat(process.platform === "win32" ? current.ipcPath.startsWith(`\\\\.\\pipe\\gtm-connections-${state.id}-`) : current.ipcPath.startsWith(state.directory + "/m-"), "invalid_ipc_path", 403);
      requireThat(typeof current.ipcToken === "string" && /^[a-f0-9]{64}$/.test(current.ipcToken), "reopen_connections", 409);
      const result = await new Promise((resolve, reject) => {
        const req = httpRequest({ socketPath: current.ipcPath, path: "/connections", headers: { authorization: `Bearer ${current.ipcToken}` }, timeout: 5000 }, (res) => {
          let size = 0; const chunks = []; res.on("data", (chunk) => { size += chunk.length; if (size > 2 * 1024 * 1024) req.destroy(Error("inventory_too_large")); else chunks.push(chunk); });
          res.on("end", () => { try { requireThat(res.statusCode === 200, "inventory_unavailable", 503); resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (error) { reject(error); } });
        }); req.on("error", reject); req.on("timeout", () => req.destroy(Error("inventory_unavailable"))); req.end();
      });
      console.log(JSON.stringify(result)); return;
    }
  }
  const server = await startLocal(state.workspace, { open: positionals[0] === "open", publish: positionals[0] === "open" });
  if (positionals[0] === "list") { try { console.log(JSON.stringify(await server.manager.inventory())); } finally { await server.close(); } }
  else {
    console.log(JSON.stringify({ status: "local_ready", origin: server.origin }));
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close().then(() => process.exit(0)));
  }
}
main().catch((error) => { console.error(JSON.stringify(safeError(error))); process.exitCode = 1; });
