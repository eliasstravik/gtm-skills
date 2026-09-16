import test from "node:test";
import assert from "node:assert/strict";
import { verificationReceipt, verifyReceipt } from "../src/verification.mjs";
import { finishHostedSetup } from "../setup/verification.mjs";
import { openJournal } from "../src/journal.mjs";
import { INTEGRATION_SCOPES } from "../src/vercel.mjs";
const secret = "synthetic-session-secret-longer-than-forty-three-characters";
const identity = { origin: "https://admin.example", teamId: "team", projectId: "workflow", adminProjectId: "admin", installationId: "installation",
  actor: "owner", deploymentId: "admin-deployment", runtimeDeploymentId: "workflow-deployment", runtimeCommit: "a".repeat(40), componentDigest: "b".repeat(64) };
test("verification proof binds the signed-in owner and both deployed artifacts, and expires", () => {
  const now = 1700000000000, receipt = verificationReceipt(identity, secret, now);
  assert.equal(verifyReceipt(receipt, secret, identity, now).actor, "owner");
  assert.throws(() => verifyReceipt(receipt, secret, { ...identity, actor: "other-owner" }, now), /verification_binding_denied/);
  assert.throws(() => verifyReceipt(receipt, secret, { ...identity, runtimeDeploymentId: "older-deployment" }, now), /verification_binding_denied/);
  assert.throws(() => verifyReceipt(receipt, secret, identity, now + 300001), /verification_binding_denied/);
  assert.throws(() => verifyReceipt({ ...receipt, signature: "0".repeat(64) }, secret, identity, now), /verification_signature_denied/);
  assert.equal(JSON.stringify(receipt).includes(secret), false);
});
test("verified setup cleans temporary credentials and repeated setup needs no new registration", async () => {
  const journal = await openJournal({ url: ":memory:" }), values = new Map([["SESSION_SECRET", secret], ["INTEGRATION_CLIENT_SECRET", "synthetic"], ["IDENTITY_CLIENT_SECRET", "synthetic"], ["INTEGRATION_TOKEN", "synthetic"]]);
  const fixed = { ...identity, ownerId: "owner", integrationId: "integration" };
  const api = async (_method, path) => {
    if (path === "/v2/user") return { user: { id: "owner" } };
    if (path.includes("/members")) return { members: [{ uid: "owner", confirmed: true, role: "OWNER" }], pagination: { next: null } };
    if (path.includes("configuration/")) return { id: "installation", integrationId: "integration", userId: "owner", teamId: "team", projects: ["workflow"], scopes: INTEGRATION_SCOPES };
    return { id: path.endsWith("admin") ? "admin" : "workflow", accountId: "team" };
  };
  const args = { api, fixed, state: { id: "workspace" }, component: { digest: identity.componentDigest }, journal,
    runtime: { deploymentId: identity.runtimeDeploymentId }, manager: { deploymentId: identity.deploymentId }, commit: identity.runtimeCommit,
    store: { loadForRuntime: (key) => values.get(key), remove: (key) => values.delete(key) } };
  try {
    await journal.set("bootstrap", { ...fixed, phase: "admin_configured", expires: Date.now() + 60000 });
    await assert.rejects(finishHostedSetup(args), /human_verification_required/);
    const receipt = verificationReceipt(identity, secret);
    assert.equal((await finishHostedSetup({ ...args, receipt })).status, "production_ready");
    assert.equal((await journal.get("bootstrap")).phase, "complete");
    assert.deepEqual([...values.keys()], ["SESSION_SECRET"]);
    assert.equal((await finishHostedSetup(args)).status, "production_ready");
    await assert.rejects(finishHostedSetup({ ...args, runtime: { deploymentId: "changed" } }), /human_verification_required/);
  } finally { journal.close(); }
});
