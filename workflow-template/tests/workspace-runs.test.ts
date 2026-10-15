import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceRuns, workspaceRunWorkflow } from "../templates/lib/viewer-workspace-runs";
import { runDestination } from "../templates/lib/viewer-destinations";
import type { Display } from "../templates/lib/viewer-contract";

const entries = [
  { id: "uuid-a", slug: "alpha", title: "Alpha research", workflowName: "new-alpha" },
  { id: "uuid-b", slug: "beta", title: "Beta score", workflowName: "beta" },
] as Display[];
const scope = { workspace: "project", environment: "production" };
const now = Date.parse("2026-10-07T12:00:00Z");
const id = "wrun_" + "A".repeat(26);
const run = (extra: any = {}) => ({ runId: id, workflowName: "beta", status: "completed", createdAt: new Date(now), ...extra });
const attrs = (extra: any = {}) => ({ "gtm.viewer.workspace": "project", "gtm.viewer.environment": "production", "gtm.viewer.id": "uuid-a", ...extra });
const url = (q = "") => new URL(`https://private.example/api/viewer?${q}`);

test("UUID beats renamed workflow names; legacy association is exact and unique", () => {
  assert.equal(workspaceRunWorkflow(entries, scope, run({ workflowName: "old-alpha", attributes: attrs() }))?.id, "uuid-a");
  assert.equal(workspaceRunWorkflow(entries, scope, run())?.id, "uuid-b");
  assert.equal(workspaceRunWorkflow([...entries, { ...entries[0], workflowName: "beta" }], scope, run()), undefined);
  assert.equal(workspaceRunWorkflow(entries, scope, run({ attributes: attrs({ "gtm.viewer.id": "removed" }) })), undefined);
  assert.equal(workspaceRunWorkflow(entries, scope, run({ workflowName: "unknown" })), undefined);
});
test("conflicting scope and fan-out children are excluded even with a known UUID", () => {
  for (const a of [{ "gtm.viewer.workspace": "other" }, { "gtm.viewer.environment": "preview" }, { "gtm.viewer.parent": "parent" }])
    assert.equal(workspaceRunWorkflow(entries, scope, run({ attributes: attrs(a) })), undefined);
});
test("mixed-workflow list is metadata only and carries workflow choices", async () => {
  const result = await workspaceRuns(async (options) => {
    assert.equal(options.resolveData, "none");
    assert.equal(options.pagination.limit, 25);
    assert.equal("workflowName" in options, false);
    return { data: [run({ attributes: attrs(), input: "PRIVATE", output: "PRIVATE" }), run()] };
  }, entries, scope, url(), now);
  assert.deepEqual(result.data.map((r) => r.workflow.id), ["uuid-a", "uuid-b"]);
  assert.equal(result.workflows.length, 2);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("workflow, period and case-insensitive search compose without losing renamed UUIDs", async () => {
  const list = async () => ({ data: [run({ workflowName: "old-alpha", attributes: attrs() }), run(), run({ attributes: attrs(), createdAt: new Date(now - 2 * 86400000) })] });
  const result = await workspaceRuns(list, entries, scope, url("runsWorkflow=uuid-a&period=day&q=ALPHA"), now);
  assert.equal(result.data.length, 1);
  assert.equal((await workspaceRuns(list, entries, scope, url("q=no-match"), now)).data.length, 0);
  assert.equal((await workspaceRuns(list, entries, scope, url(`q=${id}`), now)).data.length, 3);
});
test("status is pushed to the runtime and opaque cursor advances across sparse pages", async () => {
  const calls: any[] = [];
  const result = await workspaceRuns(async (o) => {
    calls.push(o);
    return calls.length === 1 ? { data: [run({ workflowName: "other" })], cursor: "second", hasMore: true } : { data: [run()], cursor: "third", hasMore: true };
  }, entries, scope, url("status=completed&cursor=first"), now);
  assert.equal(calls[0].status, "completed");
  assert.equal(calls[0].pagination.cursor, "first");
  assert.equal(calls[1].pagination.cursor, "second");
  assert.equal(result.cursor, "third");
  assert.equal(result.hasMore, true);
});
test("scanning is capped at eight pages, preserving continuation even with zero matches", async () => {
  let n = 0;
  const result = await workspaceRuns(async () => ({ data: [], cursor: `cursor-${++n}`, hasMore: true }), entries, scope, url(), now);
  assert.equal(n, 8);
  assert.equal(result.cursor, "cursor-8");
  assert.equal(result.hasMore, true);
});
test("stuck/missing pagination fails instead of repeating or silently truncating", async () => {
  for (const cursor of [undefined, "same"])
    await assert.rejects(workspaceRuns(async () => ({ data: [], hasMore: true, cursor }), entries, scope, url("cursor=same")), /pagination/);
});
test("invalid filters fail before reading runtime history", async () => {
  for (const q of ["period=toString", "status=broken", "runsWorkflow=missing", `cursor=${"a".repeat(513)}`, `q=${"a".repeat(201)}`])
    await assert.rejects(workspaceRuns(async () => { throw new Error("must not read"); }, entries, scope, url(q)), (e: any) => e.status === 400);
});
test("native hosted details require explicit verified Vercel settings; local inspector remains native", () => {
  const before = { VERCEL: process.env.VERCEL, GTM_VIEWER_VERCEL_RUNS_URL: process.env.GTM_VIEWER_VERCEL_RUNS_URL };
  try {
    process.env.VERCEL = "1";
    for (const value of ["", "https://evil.example/team/project/workflows/runs", "https://vercel.com/team/project", "https://name:password@vercel.com/team/project/workflows/runs"] ) {
      process.env.GTM_VIEWER_VERCEL_RUNS_URL = value;
      assert.equal(runDestination(id), undefined);
    }
    process.env.GTM_VIEWER_VERCEL_RUNS_URL = "https://vercel.com/team/project/workflows/runs?environment=production";
    assert.equal(runDestination(id)?.url, `https://vercel.com/team/project/workflows/runs/${id}?environment=production`);
    assert.equal(runDestination("bad"), undefined);
    delete process.env.VERCEL;
    assert.equal(runDestination(id)?.url, `/_workflow/run/${id}`);
  } finally {
    for (const [k, v] of Object.entries(before)) v === undefined ? delete process.env[k] : process.env[k] = v;
  }
});
