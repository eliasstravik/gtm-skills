import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { viewerApi } from "../templates/lib/viewer-handler";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
import { hostedOwnerCheck } from "../templates/lib/viewer-access";
import { lastRuns, nestStages, stageRunWorkflow, workspaceRuns } from "../templates/lib/viewer-workspace-runs";
import { groupsSource, validateGroups } from "../templates/scripts/viewer-groups.mjs";
import { registrySource } from "../templates/scripts/viewer-registry.mjs";
import { foldersToGroups, readFolderState, renderGroups, suggestGroups } from "../templates/scripts/folders-to-groups.mjs";
import { readFileSync } from "node:fs";
import { ago, cronText, matches, passes, rollUp, sections, type ListedWorkflow } from "../templates/viewer/groups";
import { fixtureRuns, run, runId } from "./api-fixture";
import { fixtureGroups } from "./groups-fixture";
import type { Display } from "../templates/lib/viewer-contract";
hostedOwnerCheck.check = async () => {};
Object.assign(process.env, {
  VERCEL: "1",
  VERCEL_PROJECT_ID: "fixture",
  VERCEL_ENV: "production",
  GTM_VIEWER_PROTECTED: "1",
  GTM_VIEWER_SHARE_ORIGIN: "https://share.example",
  VERCEL_AUTOMATION_BYPASS_SECRET: "fixture-credential",
  GTM_VIEWER_LINK_KEY: "ab".repeat(32),
});
const database = await testDatabase();
const client = db();
after(closeDb);
await client.execute("CREATE TABLE fixture_people (key TEXT PRIMARY KEY, name TEXT)");
await client.execute("CREATE TABLE fixture_scores (key TEXT PRIMARY KEY, score TEXT)");
await client.execute("CREATE TABLE elsewhere (key TEXT PRIMARY KEY)");
await client.execute("INSERT INTO elsewhere VALUES ('x')");

const api = (query: string, init: RequestInit = {}) =>
  viewerApi(new Request(`https://private.example/api/viewer?v=3&${query}`, { ...init, headers: { "x-gtm-viewer-project": "fixture", ...(init.headers ?? {}) } }));
async function withRuns<T>(runs: any[], work: () => Promise<T>) {
  const originals = [...fixtureRuns];
  fixtureRuns.splice(0, fixtureRuns.length, ...runs);
  try { return await work(); } finally { fixtureRuns.splice(0, fixtureRuns.length, ...originals); }
}

const registry = [{ id: "uuid-a", slug: "alpha" }, { id: "uuid-b", slug: "beta" }, { id: "uuid-c", slug: "gamma" }];
test("groups resolve slugs to permanent IDs in file order; every mistake fails the build by name", () => {
  assert.deepEqual(validateGroups([{ id: "pipeline", name: " Pipeline ", workflows: ["beta", "alpha"] }], registry),
    [{ id: "pipeline", name: "Pipeline", description: "", workflows: ["uuid-b", "uuid-a"] }]);
  const bad: [unknown, RegExp][] = [
    [{}, /must be a list/],
    [[{ id: "a", name: "A", workflows: ["missing"] }], /no registered workflow "missing"/],
    [[{ id: "a", name: "A", workflows: ["alpha"] }, { id: "b", name: "B", workflows: ["alpha"] }], /alpha is already in group a/],
    [[{ id: "a", name: "A", workflows: ["alpha"] }, { id: "a", name: "B", workflows: ["beta"] }], /duplicate group id a/],
    [[{ id: "a", name: "A", workflows: [] }], /at least one workflow/],
    [[{ id: "Not ok", name: "A", workflows: ["alpha"] }], /lowercase/],
    [[{ id: "a", name: "", workflows: ["alpha"] }], /name must be/],
    [[{ id: "a", name: "A", workflows: ["alpha"], folder: "x" }], /unknown property folder/],
    [[{ id: "a", name: "A", description: "x".repeat(281), workflows: ["alpha"] }], /description/],
  ];
  for (const [value, message] of bad) assert.throws(() => validateGroups(value, registry), message);
});

test("the build reads groups.ts without running it, and a workspace without one has no groups", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-groups-"));
  try {
    assert.deepEqual(groupsSource(registry, join(dir, "groups.ts")), []);
    await writeFile(join(dir, "groups.ts"), `import type { WorkflowGroup } from "../lib/viewer-contract";
import type { workflows } from "./index";
const social = "Social";
export const groups = [
  { id: "social", name: social, description: "Posts and people.", workflows: ["gamma", "alpha"] },
] as const satisfies readonly WorkflowGroup<keyof typeof workflows>[];
`);
    assert.deepEqual(groupsSource(registry, join(dir, "groups.ts")), [{ id: "social", name: "Social", description: "Posts and people.", workflows: ["uuid-c", "uuid-a"] }]);
    await writeFile(join(dir, "groups.ts"), "export const groups = make();\n");
    assert.throws(() => groupsSource(registry, join(dir, "groups.ts")), /statically readable/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the registry records which workflows another workflow starts as stages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-stages-")), cwd = process.cwd();
  try {
    await mkdir(join(dir, "workflows"));
    const workflow = (name: string, body = "") => `/**\n * ${name}\n */\n${body}\nexport async function ${name}() { "use workflow"; }\n`;
    await writeFile(join(dir, "workflows/monitor.ts"), workflow("monitor", `import { stageOne } from "./stage-one";\nimport type { stageTwo } from "./stage-two";`));
    await writeFile(join(dir, "workflows/stage-one.ts"), workflow("stageOne"));
    await writeFile(join(dir, "workflows/stage-two.ts"), workflow("stageTwo"));
    await writeFile(join(dir, "workflows/index.ts"), `import { monitor } from "./monitor";
import { stageOne } from "./stage-one";
import { stageTwo } from "./stage-two";
export const workflows = {
  monitor: { run: monitor, viewer: { id: "00000000-0000-4000-8000-000000000001" } },
  "stage-one": { run: stageOne, intake: stageOne, viewer: { id: "00000000-0000-4000-8000-000000000002" } },
  "stage-two": { run: stageTwo, viewer: { id: "00000000-0000-4000-8000-000000000003" } },
};
`);
    process.chdir(dir);
    const entries = registrySource();
    assert.deepEqual(entries.map((e: any) => [e.slug, e.startedBy, e.intake]), [
      ["monitor", undefined, undefined], ["stage-one", ["monitor"], true], ["stage-two", undefined, undefined],
    ]);
  } finally { process.chdir(cwd); await rm(dir, { recursive: true, force: true }); }
});

test("the list carries groups, triggers, tables and providers from the build, and no run history", async () => {
  const list = await (await api("op=list")).json();
  assert.deepEqual(list.groups, fixtureGroups);
  const stable = list.workflows.find((w: any) => w.id === "stable");
  assert.deepEqual(stable.tables, ["fixture_people"]);
  assert.deepEqual(stable.providers, ["Fixture"]);
  assert.deepEqual(stable.trigger, {});
  assert.deepEqual(list.workflows.find((w: any) => w.id === "result-only").tables, ["fixture_scores"]);
  assert.equal("folders" in list, false);
  assert.ok(!JSON.stringify(list).includes(runId));
  // A share link never reaches the list, and a folder command is gone.
  assert.equal((await viewerApi(new Request("https://private.example/api/viewer?v=3&op=list&workflow=stable", { headers: { "x-gtm-viewer-project": "fixture" } }), true)).status, 404);
  assert.equal((await api("op=folders", { method: "POST", body: "{}", headers: { "content-type": "application/json" } })).status, 405);
});

test("a workflow page names its group to the owner only", async () => {
  const meta = await (await api("op=meta&workflow=stable")).json();
  assert.deepEqual(meta.group, { id: "network-group", name: "Network" });
  assert.equal((await (await api("op=meta&workflow=result-only")).json()).group, undefined);
  const preview = await (await api("op=meta&workflow=stable&preview=logic")).json();
  assert.equal(preview.group, undefined);
});

test("a group's Data lists only its workflows' tables, empty or not; an unknown group is refused", async () => {
  const page = await (await api("op=data&group=network-group")).json();
  assert.deepEqual(page.tabs.map((t: any) => t.label), ["fixture_people"]);
  assert.equal(page.total, 0);
  assert.ok(page.tabs[0].href.includes("group=network-group"));
  assert.equal((await api("op=data&group=network-group&table=elsewhere")).status, 400);
  assert.equal((await api("op=data&group=missing")).status, 404);
  assert.equal((await api("op=data&group=network-group&preview=data")).status, 403);
  const all = await (await api("op=data")).json();
  assert.ok(all.tabs.some((t: any) => t.label === "elsewhere"));
});

test("group Runs lists only its workflows, with the runs they started nested under them", async () => {
  const parent = { ...run, runId: "wrun_parent", createdAt: new Date(Date.now() - 60000) };
  const stage = { ...run, runId: "wrun_stage", status: "failed", createdAt: new Date(), attributes: { "gtm.viewer.parent": "wrun_parent" } };
  const other = { ...run, runId: "wrun_other", workflowName: "scores", attributes: { ...run.attributes, "gtm.viewer.id": "result-only" } };
  await withRuns([stage, other, parent], async () => {
    const grouped = await (await api("op=workspaceRuns&group=network-group")).json();
    assert.deepEqual(grouped.data.map((r: any) => [r.id, r.parent]), [["wrun_parent", undefined], ["wrun_stage", "wrun_parent"]]);
    assert.deepEqual(grouped.workflows.map((w: any) => w.id), ["stable"]);
    assert.equal((await api("op=workspaceRuns&group=network-group&runsWorkflow=result-only")).status, 400);
    // The workspace Runs tab is unchanged: top-level runs of every workflow.
    const all = await (await api("op=workspaceRuns")).json();
    assert.deepEqual(all.data.map((r: any) => r.id), ["wrun_other", "wrun_parent"]);
  });
});

const entries = [
  { id: "a", slug: "a", title: "A", workflowName: "wf-a" },
  { id: "b", slug: "b", title: "B", workflowName: "wf-b" },
  { id: "c", slug: "c", title: "C", workflowName: "wf-c" },
] as Display[];
const scope = { workspace: "w", environment: "production" };
const own = (id: string, extra: any = {}) => ({ runId: `${id}-${extra.n ?? 0}`, workflowName: `wf-${id}`, status: "completed", createdAt: new Date(), attributes: { "gtm.viewer.workspace": "w", "gtm.viewer.environment": "production", "gtm.viewer.id": id }, ...extra });

test("last runs read each workflow by its own name, so a busy workflow never hides another's failure", async () => {
  const history = [
    ...Array.from({ length: 60 }, (_, n) => own("a", { n })),
    own("b", { status: "failed", createdAt: new Date(Date.now() - 86400000) }),
    // c ran only as a stage of a, and split into fan-out parts that are not runs of their own.
    { runId: "c-stage", workflowName: "wf-c", status: "running", createdAt: new Date(), attributes: { "gtm.viewer.parent": "a-0" } },
  ];
  const calls: any[] = [];
  const result = await lastRuns(async (options) => {
    calls.push(options);
    return { data: history.filter((r) => r.workflowName === options.workflowName).slice(0, options.pagination.limit), hasMore: false };
  }, entries, scope);
  assert.deepEqual(calls.map((c) => c.workflowName).sort(), ["wf-a", "wf-b", "wf-c"]);
  assert.ok(calls.every((c) => c.resolveData === "none"));
  assert.equal((result.a as any).id, "a-0");
  assert.equal((result.b as any).status, "failed");
  assert.deepEqual([(result.c as any).id, (result.c as any).stage], ["c-stage", true]);
  // A fan-out part carries its own workflow's ID: the parent run counts, the part does not.
  const parts = [own("a", { runId: "part", attributes: { ...own("a").attributes, "gtm.viewer.parent": "x" } })];
  const partsOnly = await lastRuns(async () => ({ data: parts, hasMore: true }), [entries[0]], scope);
  assert.equal(partsOnly.a, "unknown");
  assert.equal((await lastRuns(async () => ({ data: [], hasMore: false }), [entries[0]], scope)).a, null);
});

test("the summary is the owner's: never a share link or a preview", async () => {
  await withRuns([run], async () => {
    const summary = await (await api("op=summary")).json();
    assert.equal(summary.lastRuns.stable.id, runId);
    assert.equal(summary.lastRuns["result-only"], null);
    assert.equal((await api("op=summary&workflow=stable&preview=runs")).status, 403);
  });
});

test("stage runs need an unambiguous workflow name and a matching scope; nesting keeps start order", () => {
  const stage = { runId: "s", workflowName: "wf-b", status: "completed", createdAt: new Date(), attributes: { "gtm.viewer.parent": "p" } };
  assert.equal(stageRunWorkflow(entries, scope, stage)?.id, "b");
  assert.equal(stageRunWorkflow(entries, scope, { ...stage, attributes: {} }), undefined);
  assert.equal(stageRunWorkflow(entries, scope, { ...stage, attributes: { ...stage.attributes, "gtm.viewer.environment": "local" } }), undefined);
  assert.equal(stageRunWorkflow([...entries, { ...entries[1], id: "b2" }], scope, stage), undefined);
  const t = (s: number) => new Date(Date.parse("2026-10-14T10:00:00Z") + s * 1000);
  const page = [
    { id: "late-stage", parent: "p", createdAt: t(30) }, { id: "orphan", parent: "gone", createdAt: t(25) },
    { id: "early-stage", parent: "p", createdAt: t(10) }, { id: "p", createdAt: t(0) },
  ];
  assert.deepEqual(nestStages(page).map((r) => r.id), ["orphan", "p", "early-stage", "late-stage"]);
});

test("a group filter on workspace runs refuses a workflow outside the group", async () => {
  const group = { id: "g", name: "G", description: "", workflows: ["a"] };
  await assert.rejects(workspaceRuns(async () => { throw new Error("must not read"); }, entries, scope, new URL("https://x/?runsWorkflow=b"), Date.now(), group), (e: any) => e.status === 400);
});

const listed = (id: string, extra: Partial<ListedWorkflow> = {}): ListedWorkflow =>
  ({ id, slug: id, title: id.toUpperCase(), description: "", trigger: {}, tables: [], providers: [], ...extra });
test("the home page shows groups in file order, then Other, with computed chips and search", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");
  const workflows = [listed("a", { tables: ["people"] }), listed("b", { trigger: { schedule: "0 7 * * *" }, tables: ["people", "companies"] }), listed("c", { providers: ["Blitz"] }), listed("d")];
  const groups = [{ id: "g", name: "Social", description: "", workflows: ["b", "a"] }];
  const runs = { a: { id: "1", status: "failed", createdAt: new Date(now - 3600000).toISOString() }, b: null, c: "unknown" as const };
  const all = sections(workflows, groups, () => true, runs);
  assert.deepEqual(all.map((s) => [s.group?.id, s.workflows.map((w) => w.id)]), [["g", ["b", "a"]], [undefined, ["c", "d"]]]);
  assert.deepEqual(sections(workflows, groups, () => true, runs, true)[0].workflows.map((w) => w.id), ["a", "b"], "failing first in the preview");
  assert.deepEqual(sections(workflows, groups, (w) => w.id === "c", runs).map((s) => s.group?.id), [undefined]);
  assert.deepEqual(workflows.filter((w) => passes("scheduled", w, runs, now)).map((w) => w.id), ["b"]);
  assert.deepEqual(workflows.filter((w) => passes("failing", w, runs, now)).map((w) => w.id), ["a"]);
  assert.deepEqual(workflows.filter((w) => passes("week", w, runs, now)).map((w) => w.id), ["a"]);
  assert.ok(matches("social", workflows[1], groups[0]) && matches("blitz", workflows[2]) && matches("companies", workflows[1]));
  assert.ok(!matches("social", workflows[2]));
  assert.equal(rollUp([workflows[0], workflows[1]], runs, now), "2 workflows · last run 1 h ago · 1 failing · 2 tables");
  assert.equal(rollUp([workflows[3]], undefined, now), "1 workflow");
  assert.equal(ago(now - 40 * 60000, now), "40 min ago");
  assert.deepEqual(["0 7 * * *", "30 6 * * 1", "0 9 * * 1-5", "*/15 * * * *"].map(cronText), ["Daily 07:00 UTC", "Mon 06:30 UTC", "Weekdays 09:00 UTC", "Cron */15 * * * *"]);
});

const folderEntries = [
  { id: "11111111-1111-4111-8111-111111111111", slug: "enrich-emea", title: "Enrich EMEA" },
  { id: "22222222-2222-4222-8222-222222222222", slug: "score-emea", title: "Score EMEA" },
  { id: "33333333-3333-4333-8333-333333333333", slug: "digest", title: "Digest" },
];
const outbound = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", emea = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", empty = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const gone = "99999999-9999-4999-8999-999999999999";
test("migration: each folder holding workflows becomes a group named by its path; empty folders and missing workflows are reported", () => {
  const state = {
    folders: [{ id: outbound, parentId: null, name: "Outbound" }, { id: emea, parentId: outbound, name: "EMEA" }, { id: empty, parentId: null, name: "Archive" }],
    assignments: { [folderEntries[1].id]: emea, [folderEntries[0].id]: emea, [folderEntries[2].id]: outbound, [gone]: emea },
  };
  const result = foldersToGroups(state, folderEntries);
  assert.deepEqual(result.groups, [
    { id: "outbound", name: "Outbound", workflows: ["digest"] },
    { id: "outbound-emea", name: "Outbound · EMEA", workflows: ["enrich-emea", "score-emea"] },
  ]);
  assert.deepEqual(result.emptyFolders, ["Archive"]);
  assert.deepEqual(result.missing, [{ workflowId: gone, folder: "Outbound · EMEA" }]);
  // What it proposes passes the build's own check.
  assert.equal(validateGroups(result.groups, folderEntries).length, 2);
  assert.deepEqual(foldersToGroups({ folders: [], assignments: {} }, folderEntries).groups, []);
});

test("migration: the proposed file is the template's own format, and the template's file is its empty form", async () => {
  assert.equal(renderGroups([]), readFileSync(join(process.env.GTM_TEST_RUNTIME!, "workflows/groups.ts"), "utf8"));
  const dir = await mkdtemp(join(tmpdir(), "gtm-render-"));
  try {
    const groups = [{ id: "outbound", name: 'Outbound "EU"', description: "Cold outreach.", workflows: ["digest", "enrich-emea"] }];
    await writeFile(join(dir, "groups.ts"), renderGroups(groups));
    assert.deepEqual(groupsSource(folderEntries, join(dir, "groups.ts")), [{ ...groups[0], workflows: [folderEntries[2].id, folderEntries[0].id] }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("migration reads one scope's folders from the old tables, read-only, and an install without them has none", async () => {
  await database.query(`INSERT INTO gtm.workflow_folder_scopes (workspace, environment) VALUES ('prj_a', 'production'), ('local', 'local')`);
  await database.query(`INSERT INTO gtm.workflow_folders (workspace, environment, id, parent_id, name) VALUES ('prj_a', 'production', $1, NULL, 'Outbound'), ('local', 'local', $2, NULL, 'Mine')`, [outbound, emea]);
  await database.query(`INSERT INTO gtm.workflow_folder_assignments VALUES ('prj_a', 'production', $1, $2)`, [folderEntries[0].id, outbound]);
  const production = await readFolderState(database.unpooled, { environment: "production", workspace: "prj_a" });
  assert.deepEqual(production.folders, [{ id: outbound, parentId: null, name: "Outbound" }]);
  assert.deepEqual(production.assignments, { [folderEntries[0].id]: outbound });
  const local = await readFolderState(database.unpooled, { environment: "local", workspace: "local" });
  assert.deepEqual(local.folders.map((f: any) => f.name), ["Mine"]);
  assert.deepEqual(foldersToGroups(production, folderEntries).groups, [{ id: "outbound", name: "Outbound", workflows: ["enrich-emea"] }]);
  const fresh = await testDatabase({ migrated: false });
  assert.deepEqual(await readFolderState(fresh.unpooled, { environment: "local", workspace: "local" }), { folders: [], assignments: {}, scopes: [] });
});

test("without folders, groups come from the code: stages, a shared data definition, a shared workflow table", () => {
  const social = { tables: [{ name: "socialPeople" }] };
  const entries = [
    { id: "1", slug: "monitor", title: "Social monitor", data: social },
    { id: "2", slug: "discover", title: "Discover posts", data: social, startedBy: ["monitor"] },
    { id: "3", slug: "enrich", title: "Enrich interactors", startedBy: ["monitor"], resultTables: ["people"] },
    { id: "4", slug: "network", title: "Enrich network", resultTables: ["people", "networkScores"] },
    { id: "5", slug: "network-score", title: "Score network", resultTables: ["networkScores"] },
    { id: "6", slug: "digest", title: "Digest" },
  ];
  assert.deepEqual(suggestGroups(entries), [
    { id: "social-monitor", name: "Social monitor", workflows: ["monitor", "discover", "enrich"] },
    { id: "enrich-network", name: "Enrich network", workflows: ["network", "network-score"] },
  ]);
});

test("the agent's group link names the group's workflows and its private Runs and Data pages", async () => {
  const { default: route } = await import("../templates/server/api/link/group/[id].get");
  const call = (id: string) => (route as any)({ req: new Request(`https://private.example/api/link/group/${id}`), context: { params: { id } } });
  const link = await (await call("network-group")).json();
  assert.equal(link.name, "Network");
  assert.deepEqual(link.workflows.map((w: any) => w.slug), ["network"]);
  assert.equal(link.viewerUrl, "https://private.example/viewer?group=network-group");
  assert.equal(link.runsUrl, "https://private.example/viewer?group=network-group&view=runs");
  assert.equal(link.dataUrl, "https://private.example/viewer?group=network-group&view=data");
  assert.equal((await call("missing")).status, 404);
});
