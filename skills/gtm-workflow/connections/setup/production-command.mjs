import { nativeStore } from "../local/storage.mjs";
import { openBrowser } from "../local/server.mjs";
import { fixedOrigin } from "../src/validation.mjs";
import { boundedResponse } from "../src/vercel.mjs";
import { requireThat } from "../src/errors.mjs";
import { runtimeSnapshot } from "../src/snapshot.mjs";
export async function productionCommand(command, state, config) {
  const p = config.production; requireThat(p, "run_hosted_setup", 409);
  if (command === "open") { await openBrowser(`${fixedOrigin(p.origin)}${p.mode === "private-project" ? "/connections" : ""}`); return { status: "opened" }; }
  const store = nativeStore(`${state.id}/setup`), bearer = store.loadForRuntime("RUNTIME_READ_SECRET"), bypass = store.loadForRuntime("RUNTIME_BYPASS");
  requireThat(bearer && bypass, "read_transport_unavailable", 503);
  const response = await fetch(`${fixedOrigin(p.runtimeOrigin)}/api/connections`, { redirect: "error", signal: AbortSignal.timeout(10000), headers: { authorization: `Bearer ${bearer}`, "x-vercel-protection-bypass": bypass } });
  requireThat(response.ok, "runtime_unavailable", 503);
  const result = runtimeSnapshot(await boundedResponse(response));
  requireThat(result.version === 1 && result.workspace === p.projectId && result.environment === "production", "runtime_identity_mismatch", 503);
  return result;
}
