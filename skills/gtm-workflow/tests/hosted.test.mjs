// Going live: the pure parts of hosted setup and Doctor, and the template-owned vercel.json.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNTIME_SETTINGS, SHARE_SETTINGS, bypassSummary, computePatch, computeProblems, localAgentBackend, settingsPatch, shareTrust, workflowProject } from "../scripts/hosted.mjs";
import { mergeVercelJson } from "../scripts/setup.mjs";

test("the runtime builds every push to main, never previews, and is protected everywhere", () => {
  assert.equal(RUNTIME_SETTINGS.commandForIgnoringBuildStep, null);
  assert.equal(RUNTIME_SETTINGS.previewDeploymentsDisabled, true);
  // An edit to an ICP or persona only touches files outside workflows/; the runtime must still rebuild to bake it in.
  assert.equal(RUNTIME_SETTINGS.enableAffectedProjectsDeployments, false);
  assert.deepEqual(RUNTIME_SETTINGS.ssoProtection, { deploymentType: "all" });
  assert.equal(SHARE_SETTINGS.ssoProtection, null);
  assert.equal(SHARE_SETTINGS.buildCommand, "npm run build:share");
});

test("settings patch only what differs, and drop the old ignored build step", () => {
  const live = { ...RUNTIME_SETTINGS, ssoProtection: { deploymentType: "all", extra: 1 }, commandForIgnoringBuildStep: "git diff --quiet HEAD^ HEAD -- ." };
  assert.deepEqual(settingsPatch(live, RUNTIME_SETTINGS), { commandForIgnoringBuildStep: null });
  assert.deepEqual(settingsPatch({ ...RUNTIME_SETTINGS, commandForIgnoringBuildStep: undefined }, RUNTIME_SETTINGS), {});
  assert.deepEqual(Object.keys(settingsPatch({}, RUNTIME_SETTINGS)).sort(), Object.keys(RUNTIME_SETTINGS).filter((key) => key !== "commandForIgnoringBuildStep").sort());
});

test("share trust is production to production only", () => {
  const trusted = { trustedSources: { projects: { prj_s: { customAllow: [{ from: { slugs: ["production"] }, to: { slugs: ["production"] } }] } } } };
  assert.ok(shareTrust(trusted, "prj_s"));
  assert.ok(!shareTrust(trusted, "prj_other"));
  assert.ok(!shareTrust({ trustedSources: { projects: { prj_s: { customAllow: [{ from: { slugs: ["preview"] }, to: { slugs: ["production"] } }] } } } }, "prj_s"));
});

test("bypass summary counts automation bypasses and finds the env-var one, without secrets", () => {
  const project = { protectionBypass: { a: { scope: "automation-bypass", isEnvVar: false, createdAt: 2 }, b: { scope: "automation-bypass", isEnvVar: true, createdAt: 1 }, c: { scope: "shareable-link" } } };
  assert.deepEqual(bypassSummary(project), { count: 2, envVar: true });
  assert.deepEqual(bypassSummary({}), { count: 0, envVar: false });
});

test("Neon computes are pinned at 0.25 CU and sleep when idle", () => {
  assert.deepEqual(computePatch({ autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25, suspend_timeout_seconds: 0 }), {});
  assert.deepEqual(computePatch({ autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25, suspend_timeout_seconds: 300 }), {});
  assert.deepEqual(computePatch({ autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 8, suspend_timeout_seconds: 0 }), { autoscaling_limit_max_cu: 0.25 });
  assert.deepEqual(computePatch({ autoscaling_limit_min_cu: 1, autoscaling_limit_max_cu: 0.25, suspend_timeout_seconds: -1 }), { autoscaling_limit_min_cu: 0.25, suspend_timeout_seconds: 0 });
  const small = { autoscaling_limit_min_cu: 0.25, autoscaling_limit_max_cu: 0.25, suspend_timeout_seconds: 0 };
  assert.deepEqual(computeProblems({ default_endpoint_settings: small }, [{ id: "ep-a", ...small }]), []);
  // A live compute keeps its own limits when only the default changed, so both are checked.
  assert.deepEqual(computeProblems({ default_endpoint_settings: { ...small, autoscaling_limit_max_cu: 8 } }, [{ id: "ep-a", ...small }, { id: "ep-b", ...small, suspend_timeout_seconds: -1 }]),
    ["the default for new computes", "compute ep-b"]);
});

test("the project defaults to the workspace folder name, and a link wins over it", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "gtm-acme-"));
  try {
    assert.equal(workflowProject(workspace, { team: "t" }).project, workspace.split("/").pop());
    assert.equal(workflowProject(workspace, { team: "t", project: "gtm-x" }).project, "gtm-x");
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("vercel.json is template-owned except crons", async () => {
  const runtime = await mkdtemp(join(tmpdir(), "gtm-vercel-json-"));
  try {
    const crons = [{ path: "/api/run/a", schedule: "0 9 * * 1" }];
    await writeFile(join(runtime, "vercel.json"), JSON.stringify({ crons }));
    assert.equal(await mergeVercelJson(runtime), true);
    const merged = JSON.parse(await readFile(join(runtime, "vercel.json"), "utf8"));
    assert.deepEqual(merged.crons, crons);
    assert.deepEqual(merged.git, { deploymentEnabled: { "**": false, main: true } });
    assert.equal(await mergeVercelJson(runtime), false);
  } finally { await rm(runtime, { recursive: true, force: true }); }
});

test("go-live carries the local agent subscription up, only claude or codex", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-backend-"));
  try {
    assert.equal(localAgentBackend(dir), null);
    await mkdir(join(dir, "workflows"));
    for (const [line, expected] of [["GTM_AGENT_BACKEND=claude", "claude"], ["GTM_AGENT_BACKEND= Codex ", "codex"], ["GTM_AGENT_BACKEND=", null], ["GTM_AGENT_BACKEND=gateway", null], ["GTM_MODEL=x", null]]) {
      await writeFile(join(dir, "workflows", ".env"), `# settings\n${line}\n`);
      assert.equal(localAgentBackend(dir), expected, line);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
