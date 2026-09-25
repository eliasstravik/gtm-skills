// The recipe's network workflow must compile as a workflow bundle. The bundler stubs every "use step" body and keeps
// whatever workflow scope still references; a reference to any value exported by a lib module that reaches lib/db.ts
// (a default, a constant) keeps that module, and pg with it, and build-viewer fails with "You are attempting to use
// pg". No example workflow calls runNetwork, so this suite builds the recipe's workflow on a copy of the runtime, the
// way tests/authoring.mjs does, then type-checks it. No database, no provider, no paid call.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** What the enrich-network recipe tells an author to write; its sketch in recipe.md is a subset of this file. */
const WORKFLOW = `/**
 * Enrich network
 *
 * Enrich a list of connections, keep every employment role, and enrich each confirmed current company once.
 */
import { runNetwork, type NetworkRunInput } from "../lib/profiles/network-workflow";

export const WORKFLOW_ID = "5f0c2b8e-3d4a-4c6b-9e1f-7a8b9c0d1e2f";

export const defaultInput: NetworkRunInput = { provider: "blitz", sourceId: "connections", rows: [] };

export async function enrichNetwork(input: NetworkRunInput = defaultInput) {
  "use workflow";
  return runNetwork({ workflow: enrichNetwork, workflowId: WORKFLOW_ID, input, apiKeyVariable: "BLITZ_API_KEY", defaults: { maxPeople: 200, maxSpendUsd: 20, freshForDays: 30 } });
}
`;

const businessGraph = {
  nodes: [
    { id: "source", label: "Connection list", kind: "input", explanation: "Use the supplied rows." },
    { id: "people", label: "Enrich each person", kind: "action", explanation: "Resolve each profile and keep every role." },
    { id: "companies", label: "Enrich current companies", kind: "action", explanation: "Enrich each confirmed current company once." },
    { id: "done", label: "People and companies", kind: "output", explanation: "Browse the enriched people and their companies." },
  ],
  edges: [
    { id: "e0", source: "source", target: "people" },
    { id: "e1", source: "people", target: "companies" },
    { id: "e2", source: "companies", target: "done" },
  ],
};

function run(dir: string, args: string[]) {
  const result = spawnSync(process.execPath, args, { cwd: dir, encoding: "utf8" });
  return { ok: result.status === 0, output: result.stdout + result.stderr };
}

test("the recipe's runNetwork workflow builds as a workflow bundle and type-checks", async () => {
  const runtime = process.env.GTM_TEST_RUNTIME;
  if (!runtime) throw new Error("Run suites through tests/run.mjs");
  const dir = await mkdtemp(join(tmpdir(), "gtm-network-build-"));
  try {
    for (const name of ["lib", "scripts", "skills", "viewer", "connections-ui", "db", "package.json", "tsconfig.json"])
      await cp(join(runtime, name), join(dir, name), { recursive: true });
    await mkdir(join(dir, "node_modules"));
    for (const name of await readdir(join(runtime, "node_modules")))
      if (!name.startsWith(".") || name === ".bin")
        await symlink(join(runtime, "node_modules", name), join(dir, "node_modules", name), process.platform === "win32" ? "junction" : "dir");
    await mkdir(join(dir, "workflows"));
    await writeFile(join(dir, "workflows/enrich-network.ts"), WORKFLOW);
    const view = run(dir, ["scripts/profile-view.mjs", "5f0c2b8e-3d4a-4c6b-9e1f-7a8b9c0d1e2f", "workflows/enrich-network.data.ts"]);
    assert.ok(view.ok, view.output);
    await writeFile(
      join(dir, "workflows/index.ts"),
      `import { defaultInput, enrichNetwork } from "./enrich-network";
import { data, sharePolicy } from "./enrich-network.data";
// The registry reader takes explicit key: value properties only, never shorthand.
export const workflows = { "enrich-network": { run: enrichNetwork, defaultInput: defaultInput, data: data, viewer: { description: "Enrich connections and their current companies.", sharePolicy: sharePolicy, businessGraph: ${JSON.stringify(businessGraph)} } } };
`,
    );
    const register = run(dir, ["scripts/viewer-registry.mjs"]);
    assert.ok(register.ok, register.output);
    const build = run(dir, ["scripts/build-viewer.mjs"]);
    assert.ok(build.ok, `build-viewer failed for a workflow that calls runNetwork:\n${build.output}`);
    const manifest = JSON.parse(await readFile(join(dir, "node_modules/.gtm-viewer/manifest.json"), "utf8"));
    assert.ok(manifest.workflows["workflows/enrich-network.ts"]?.enrichNetwork, "the workflow is in the manifest");
    // The workflow bundle is what runs in workflow scope: pg must not be in it.
    const bundle = await readFile(join(dir, "node_modules/.gtm-viewer/workflows.mjs"), "utf8");
    assert.doesNotMatch(bundle, /from\s+["']pg["']|require\(["']pg["']\)/, "pg reached the workflow bundle");
    const types = run(dir, ["node_modules/typescript/bin/tsc", "--noEmit"]);
    assert.ok(types.ok, types.output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the recipe's sketch is what this suite builds", async () => {
  // In the skill checkout the recipe sits beside the runtime; a workspace has no copy and skips this.
  const recipe = resolve(process.env.GTM_TEST_RUNTIME!, "../recipes/enrich-network/recipe.md");
  if (!existsSync(recipe)) return;
  const sketch = /```ts\n([\s\S]*?)```/.exec(await readFile(recipe, "utf8"))?.[1];
  assert.ok(sketch, "recipe.md has a ts sketch");
  const lines = WORKFLOW.split("\n").map((line) => line.trim());
  for (const line of sketch.split("\n").map((line) => line.trim()).filter(Boolean))
    assert.ok(lines.includes(line), `recipe.md's sketch line is not in the built workflow: ${line}`);
});
