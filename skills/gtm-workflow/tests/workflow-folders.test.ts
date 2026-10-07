import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { db, closeDb } from "../templates/lib/db";
import { folderName, mutateFolders, readFolders, validateParent, type Folder } from "../templates/lib/workflow-folders";
import { viewerApi } from "../templates/lib/viewer-handler";
import { csrfCookie, hostedOwnerCheck } from "../templates/lib/viewer-access";
import { folderOptions } from "../templates/viewer/workspace";
import { testDatabase } from "./db";
const database = await testDatabase();
after(closeDb);
const scope = { workspace: "folder-test", environment: "local" }, workflow = randomUUID();
const client = db();
async function change(body: Record<string, unknown>, target = scope) {
  const { revision } = await readFolders(client, target);
  return mutateFolders(client, target, { revision, ...body }, [workflow]);
}
test("folder names and arbitrarily deep trees never become file paths", () => {
  for (const value of ["", " ", ".", "..", "../x", "x/y", "x\\y", "\u0000", "\n", "x".repeat(121)]) assert.throws(() => folderName(value));
  assert.equal(folderName("  Sales  "), "Sales");
  const folders: Folder[] = Array.from({ length: 1200 }, (_, i) => ({ id: String(i), parentId: i ? String(i - 1) : null, name: "F" }));
  assert.doesNotThrow(() => validateParent(folders, null, "1199"));
  assert.throws(() => validateParent(folders, "0", "1199"));
  assert.equal(folderOptions(folders).length, 1200);
});
test("persistent deep nesting, stable UUID assignments, rename, moves and safe deletion", async () => {
  let parentId: string | null = null, root = "";
  for (let n = 0; n < 24; n++) {
    const created = await change({ action: "create", parentId, name: `Level ${n}` });
    parentId = created.id; root ||= parentId!;
  }
  await change({ action: "assign", parentId, workflowId: workflow });
  await assert.rejects(change({ action: "move", id: root, parentId }), /descendants/);
  await assert.rejects(change({ action: "delete", id: parentId }), /Nothing was deleted/);
  await assert.rejects(change({ action: "delete", id: root }), /Nothing was deleted/);
  const destination = (await change({ action: "create", parentId: null, name: "Sales" })).id!;
  await change({ action: "move", id: root, parentId: destination });
  await change({ action: "rename", id: destination, name: "Revenue" });
  assert.equal((await readFolders(client, scope)).assignments[workflow], parentId);
  await closeDb(); // Simulates a new runtime instance: no in-memory organisation state.
  const fresh = await readFolders(db(), scope);
  assert.equal(fresh.folders.find((f) => f.id === root)?.parentId, destination);
  assert.equal(fresh.assignments[workflow], parentId);
  await mutateFolders(db(), scope, { action: "assign", parentId: null, workflowId: workflow, revision: fresh.revision }, [workflow]);
  const empty = await readFolders(db(), scope);
  await mutateFolders(db(), scope, { action: "delete", id: parentId, revision: empty.revision }, [workflow]);
  assert.ok(!(await readFolders(db(), scope)).assignments[workflow]);
});
test("scope boundaries and stale/concurrent mutations fail without partial changes", async () => {
  const target = { ...scope, environment: "other" };
  const one = await mutateFolders(db(), target, { action: "create", parentId: null, name: "One", revision: 0 }, [workflow]);
  await assert.rejects(mutateFolders(db(), scope, { action: "move", id: one.id, parentId: null, revision: (await readFolders(db(), scope)).revision }, [workflow]), /no longer exists/);
  const before = await readFolders(db(), target);
  const results = await Promise.allSettled(["A", "B"].map((name) => mutateFolders(db(), target, { action: "rename", id: one.id, name, revision: before.revision }, [workflow])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  await assert.rejects(mutateFolders(db(), target, { action: "create", parentId: null, name: "Stale", revision: before.revision }, [workflow]), /another tab/);
  const state = await readFolders(db(), target);
  assert.equal(state.folders.length, 1);
  await assert.rejects(mutateFolders(db(), target, { action: "create", parentId: null, name: state.folders[0].name.toUpperCase(), revision: state.revision }, [workflow]), /already exists/);
  await assert.rejects(mutateFolders(db(), target, { action: "assign", workflowId: randomUUID(), parentId: one.id, revision: state.revision }, [workflow]), /workspace/);
});
test("folder deletion never cleans unknown placements; explicit unassign protects other copies and business data", async () => {
  const target = { ...scope, workspace: "removed-workflows" };
  const liveId = randomUUID(), removedId = randomUUID(), otherRemovedId = randomUUID();
  const mutate = async (body: Record<string, unknown>, registered = [liveId]) => mutateFolders(db(), target, { ...body, revision: (await readFolders(db(), target)).revision }, registered);
  const first = (await mutate({ action: "create", name: "Delete me", parentId: null })).id!;
  const other = (await mutate({ action: "create", name: "Keep me", parentId: null })).id!;
  await mutate({ action: "assign", workflowId: removedId, parentId: first }, [liveId, removedId]);
  await mutate({ action: "assign", workflowId: otherRemovedId, parentId: other }, [liveId, otherRemovedId]);
  const child = (await mutate({ action: "create", name: "Child", parentId: first })).id!;
  await assert.rejects(mutate({ action: "delete", id: first }), /Nothing was deleted/);
  assert.equal((await readFolders(db(), target)).assignments[removedId], first);
  await mutate({ action: "delete", id: child });
  await mutate({ action: "assign", workflowId: liveId, parentId: first });
  await assert.rejects(mutate({ action: "delete", id: first }), /Nothing was deleted/);
  const refused = await readFolders(db(), target);
  assert.equal(refused.assignments[liveId], first);
  assert.equal(refused.assignments[removedId], first); // No premature cleanup on a refused delete.
  await mutate({ action: "assign", workflowId: liveId, parentId: null });
  await database.query("CREATE TABLE public.folder_deleted_workflow_data (id text PRIMARY KEY, value text)");
  await database.query("INSERT INTO public.folder_deleted_workflow_data VALUES ($1, 'retain')", [removedId]);
  await assert.rejects(mutate({ action: "delete", id: first }), /Nothing was deleted/);
  assert.equal((await readFolders(db(), target)).assignments[removedId], first);
  await mutate({ action: "assign", workflowId: removedId, parentId: null });
  await mutate({ action: "delete", id: first });
  const deleted = await readFolders(db(), target);
  assert.ok(!deleted.folders.some((f) => f.id === first));
  assert.equal(deleted.assignments[removedId], undefined);
  assert.equal(deleted.assignments[otherRemovedId], other);
  assert.ok(deleted.folders.some((f) => f.id === other));
  assert.equal((await database.query("SELECT value FROM public.folder_deleted_workflow_data WHERE id = $1", [removedId])).rows[0].value, "retain");
});
test("parallel opposing moves cannot form a cycle", async () => {
  const target = { ...scope, workspace: "concurrency" };
  const a = await mutateFolders(db(), target, { action: "create", parentId: null, name: "A", revision: 0 }, []);
  const b = await mutateFolders(db(), target, { action: "create", parentId: null, name: "B", revision: 1 }, []);
  const results = await Promise.allSettled([
    mutateFolders(db(), target, { action: "move", id: a.id, parentId: b.id, revision: 2 }, []),
    mutateFolders(db(), target, { action: "move", id: b.id, parentId: a.id, revision: 2 }, []),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const state = await readFolders(db(), target);
  for (const f of state.folders) validateParent(state.folders, f.id, f.parentId);
});
test("browser owner and CSRF required; shared, preview, bypass/service denied", async () => {
  delete process.env.VERCEL;
  process.env.GTM_VIEWER_WORKSPACE = "api-folders";
  const token = csrfCookie();
  const request = (extra = "", headers: Record<string, string> = {}, method = "POST") => new Request(`http://localhost/api/viewer?v=3&op=folders${extra}`, {
    method, headers: { host: "localhost", origin: "http://localhost", "content-type": "application/json", cookie: `gtm_viewer_csrf=${token.value}`, "x-gtm-csrf": token.value, ...headers },
    ...(method === "POST" ? { body: JSON.stringify({ action: "create", name: "API", parentId: null, revision: 0 }) } : {}),
  });
  assert.equal((await viewerApi(request("", { "x-gtm-csrf": "" }))).status, 403);
  assert.equal((await viewerApi(request("", { origin: "https://evil.example" }))).status, 403);
  assert.equal((await viewerApi(request("&preview=logic"))).status, 403);
  assert.equal((await viewerApi(request(), true)).status, 403);
  assert.equal((await viewerApi(request("", {}, "GET"))).status, 405);
  assert.equal((await viewerApi(request())).status, 200);
  const listing = await viewerApi(new Request("http://localhost/api/viewer?v=3&op=list", { headers: { host: "localhost" } }));
  assert.equal(listing.status, 200);
  const standalone = await listing.json();
  assert.ok(standalone.csrf); assert.equal(standalone.foldersMode, "local-only");
  assert.equal(standalone.foldersEditable, true); assert.equal(standalone.folders.folders.length, 1);
  Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_ID: "folder-test", VERCEL_ENV: "preview", GTM_VIEWER_PROTECTED: "1" });
  hostedOwnerCheck.check = async () => {};
  assert.equal((await viewerApi(request())).status, 403);
  process.env.VERCEL_ENV = "production";
  hostedOwnerCheck.check = async () => { throw new Error("no owner"); };
  assert.notEqual((await viewerApi(request())).status, 200);
  hostedOwnerCheck.check = async () => {};
  assert.notEqual((await viewerApi(request(), false, true)).status, 200);
  delete process.env.VERCEL;
});
test("workspace Runs resolves before workflow lookup; shared/preview denied, authenticated service reads allowed", async () => {
  Object.assign(process.env, { VERCEL: "1", VERCEL_PROJECT_ID: "fixture", VERCEL_ENV: "production", GTM_VIEWER_PROTECTED: "1", VERCEL_AUTOMATION_BYPASS_SECRET: "folder-suite-bypass" });
  hostedOwnerCheck.check = async () => {};
  const req = (extra = "", bypass = "") => new Request(`https://private.example/api/viewer?v=3&op=workspaceRuns${extra}`, { headers: { "x-gtm-viewer-project": "fixture", ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) } });
  try {
    assert.equal((await viewerApi(req("&workflow=not-registered"))).status, 200);
    assert.equal((await viewerApi(req(), true)).status, 403);
    assert.equal((await viewerApi(req("&preview=runs"))).status, 403);
    assert.equal((await viewerApi(req(), false, true)).status, 401);
    assert.equal((await viewerApi(req("", "folder-suite-bypass"), false, true)).status, 200);
    assert.equal((await viewerApi(new Request("https://private.example/api/viewer?v=3&op=workspaceRuns", { method: "POST", body: "{}" }))).status, 405);
  } finally {
    delete process.env.VERCEL;
    delete process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }
});
test("additive migration is idempotent and preserves existing tables, data and assignments", async () => {
  await database.query("CREATE TABLE public.folder_preserve (id integer PRIMARY KEY, name text); INSERT INTO public.folder_preserve VALUES (1, 'keep')");
  const before = await readFolders(db(), scope);
  const migration = await readFile(new URL("../drizzle-runtime/0004_workflow_folders.sql", `file://${process.env.GTM_TEST_RUNTIME}/tests/`), "utf8");
  await database.query(migration); await database.query(migration);
  assert.deepEqual(await readFolders(db(), scope), before);
  assert.equal((await database.query("SELECT name FROM public.folder_preserve")).rows[0].name, "keep");
});
