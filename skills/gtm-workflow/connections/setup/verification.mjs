import { open } from "node:fs/promises";
import { nativeStore } from "../local/storage.mjs";
import { verifyReceipt } from "../src/verification.mjs";
import { validateInstallation } from "../src/vercel.mjs";
import { requireThat } from "../src/errors.mjs";
import { verifyOwner, cleanupBootstrap } from "./bootstrap.mjs";

export async function readVerification(path) {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(8193), { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    requireThat(bytesRead > 0 && bytesRead <= 8192, "invalid_verification_receipt", 403);
    try { return JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")); }
    catch { requireThat(false, "invalid_verification_receipt", 403); }
  } finally { await file.close(); }
}
export async function finishHostedSetup({ api, fixed, state, component, journal, receipt, runtime, manager, commit, store = nativeStore(`${state.id}/setup`) }) {
  await verifyOwner(api, fixed);
  const stage = await journal.get("bootstrap");
  requireThat(stage && ["admin_configured", "deployed_verified", "complete"].includes(stage.phase), "installation_not_configured", 409);
  const installationId = stage.installationId;
  validateInstallation(await api("GET", `/v1/integrations/configuration/${encodeURIComponent(installationId)}`), { ...fixed, installationId });
  const identity = { origin: fixed.origin, teamId: fixed.teamId, projectId: fixed.projectId, adminProjectId: fixed.adminProjectId,
    installationId, actor: fixed.ownerId, deploymentId: manager.deploymentId, runtimeDeploymentId: runtime.deploymentId,
    runtimeCommit: commit, componentDigest: component.digest };
  const prior = await journal.get("verified_setup");
  if (["complete", "deployed_verified"].includes(stage.phase) && prior && Object.entries(identity).every(([key, value]) => prior[key] === value)) {
    if (stage.phase === "deployed_verified") await cleanupBootstrap({ api, fixed, journal, store, completed: true });
    return { status: "production_ready", origin: fixed.origin, projectId: fixed.projectId, adminProjectId: fixed.adminProjectId };
  }
  requireThat(receipt, "human_verification_required", 409);
  const data = verifyReceipt(receipt, store.loadForRuntime("SESSION_SECRET"), identity);
  await journal.consume(`setup-verification:${data.id}`, data.expires);
  await journal.set("verified_setup", { ...identity, verifiedAt: Date.now() });
  await journal.set("bootstrap", { ...stage, phase: "deployed_verified" });
  await cleanupBootstrap({ api, fixed, journal, store, completed: true });
  return { status: "production_ready", origin: fixed.origin, projectId: fixed.projectId, adminProjectId: fixed.adminProjectId };
}
