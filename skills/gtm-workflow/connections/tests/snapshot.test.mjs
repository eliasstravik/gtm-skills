import test from "node:test";
import assert from "node:assert/strict";
import { runtimeSnapshot } from "../src/snapshot.mjs";
import { activeReader } from "../src/vercel.mjs";

const fixture = () => ({ version: 1, workspace: "prj_fixed", environment: "production", deploymentId: "dpl_test", commit: "abc",
  generation: null, connections: [{ id: "blitz", name: "Blitz", configured: true, platformIdentity: false, usageComplete: true,
    fields: [{ variable: "BLITZ_API_KEY", present: true }], usage: [{ workflowId: "demo", title: "Demo", provider: "Blitz" }] }] });
test("runtime metadata drops unknown fields at every nesting level", () => {
  const raw = fixture(), sentinel = "synthetic-never-return-this";
  raw.value = sentinel; raw.connections[0].value = sentinel;
  raw.connections[0].fields[0].value = sentinel; raw.connections[0].usage[0].value = sentinel;
  const safe = runtimeSnapshot(raw);
  assert.equal(JSON.stringify(safe).includes(sentinel), false);
  assert.equal(safe.connections[0].fields[0].present, true);
  assert.equal(safe.connections[0].usage[0].workflowId, "demo");
  for (const corrupt of [
    (x) => { x.connections[0].fields[0].variable = "GTM_ADMIN_API_KEY"; },
    (x) => { x.connections.push(x.connections[0]); },
    (x) => { x.generation = { value: sentinel }; },
    (x) => { x.connections[0].configured = "true"; },
    (x) => { x.environment = "preview"; },
  ]) { const x = fixture(); corrupt(x); assert.throws(() => runtimeSnapshot(x), /invalid_runtime_metadata/); }
});
test("hosted active inventory checks deployment binding and projects safe metadata", async () => {
  const raw = fixture(); raw.token = "synthetic-secret";
  let deployment = { projectId: "prj_fixed", target: "production", readyState: "READY", createdAt: 123 };
  const read = activeReader({ origin: "https://workflow.example", projectId: "prj_fixed", readSecret: "read", bypass: "gate",
    api: async () => deployment, fetcher: async () => Response.json(raw) });
  const safe = await read(); assert.equal(safe.token, undefined); assert.equal(safe.deploymentCreatedAt, 123);
  deployment = { ...deployment, projectId: "prj_other" };
  await assert.rejects(read, /runtime_identity_mismatch/);
});
