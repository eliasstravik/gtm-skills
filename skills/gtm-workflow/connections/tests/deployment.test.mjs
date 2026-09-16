import test from "node:test";
import assert from "node:assert/strict";
import { deployAttempt } from "../setup/deployment.mjs";
function fixture() {
  const data = new Map(), deployments = [];
  const journal = { get: async (key) => data.get(key), set: async (key, value) => data.set(key, value) };
  let submissions = 0, lost = false, absent = false, failed = false;
  const api = async (_method, path) => path.startsWith("/v6/") ? { deployments, pagination: { next: null } } : deployments.find((row) => path.endsWith(row.id));
  const submit = async (attempt) => {
    submissions++;
    if (!absent) deployments.push({ id: `deployment-${submissions}`, projectId: "project", url: "synthetic.vercel.app", readyState: failed ? "ERROR" : "READY", meta: { gtmSetupAttempt: attempt } });
    if (lost) throw Error("lost response");
  };
  return { api, projectId: "project", journal, key: "deploy", revision: "fixed-source-and-config", submit, verify: async () => {},
    submissions: () => submissions, set: (options) => { ({ lost = false, absent = false, failed = false } = options); }, deployments };
}
test("lost deployment response is discovered; repeat setup does not create another deployment", async () => {
  const f = fixture(); f.set({ lost: true });
  const first = await deployAttempt(f), second = await deployAttempt(f);
  assert.deepEqual(first, second); assert.equal(f.submissions(), 1);
});
test("unknown deployment creation is never retried or silently replaced by newer source", async () => {
  const f = fixture(); f.set({ absent: true, lost: true });
  await assert.rejects(deployAttempt(f), /deployment_creation_unresolved/);
  await assert.rejects(deployAttempt(f), /deployment_creation_unresolved/);
  await assert.rejects(deployAttempt({ ...f, revision: "new-source" }), /prior_deployment_unresolved/);
  assert.equal(f.submissions(), 1);
});
test("a confirmed failed build allows a later setup retry, without reapplying credentials", async () => {
  const f = fixture(); f.set({ failed: true });
  await assert.rejects(deployAttempt(f), /deployment_failed/);
  assert.equal((await f.journal.get("deploy")).phase, "failed");
  f.set({}); await deployAttempt(f);
  assert.equal(f.submissions(), 2);
});
test("ready deployments from another project fail verification", async () => {
  const f = fixture();
  const submit = async (attempt) => { await f.submit(attempt); f.deployments[0].projectId = "other"; };
  await assert.rejects(deployAttempt({ ...f, submit }), /deployed_project_mismatch/);
});
