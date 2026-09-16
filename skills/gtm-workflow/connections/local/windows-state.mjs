import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireThat } from "../src/errors.mjs";
import { inspectionEnvironment } from "./inspection-environment.mjs";
export function windowsState(path, mode = "check") {
  if (process.platform !== "win32") return;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./windows-state.ps1", import.meta.url)), mode, path],
    { shell: false, windowsHide: true, encoding: "utf8", stdio: "pipe", timeout: 15000, env: inspectionEnvironment(process.env) });
  requireThat(result.status === 0, "unsafe_state_file", 403);
}
