import { BaseBuilder, createBaseBuilderConfig } from "@workflow/builders";
import { bundleViewer } from "./bundle-viewer.mjs";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { registrySource } from "./viewer-registry.mjs";
import { groupsSource, stageParents } from "./viewer-groups.mjs";
import { validateBusinessGraph, validateDescription } from "./business-graph.mjs";
import { validateDataSharing } from "../lib/viewer-policy-validation.mjs";
import { writeCriteriaSnapshot } from "./criteria-snapshot.mjs";
const out = "node_modules/.gtm-viewer";
await mkdir(out, { recursive: true });
// Before compiling: lib/criteria.ts imports the baked ICPs and personas.
await writeCriteriaSnapshot();
// Compilation only. No server, migration, schedule registration or authored module evaluation.
class ViewerBuilder extends BaseBuilder {
  constructor() {
    super({
      ...createBaseBuilderConfig({
        workingDir: process.cwd(),
        projectRoot: process.cwd(),
        dirs: ["workflows", "lib"],
      }),
      buildTarget: "next",
    });
  }
  async build() {
    const inputFiles = await this.getInputFiles();
    const result = await this.createCombinedBundle({
      inputFiles,
      stepsOutfile: resolve(out, "steps.mjs"),
      flowOutfile: resolve(out, "workflows.mjs"),
      format: "esm",
      bundleFinalOutput: false,
      externalizeNonSteps: true,
    });
    await result.stepsContext?.dispose();
    await result.interimBundleCtx?.dispose();
    await this.createManifest({
      workflowBundlePath: resolve(out, "workflows.mjs"),
      manifestDir: resolve(out),
      manifest: result.manifest,
    });
  }
}
await new ViewerBuilder().build();
const manifest = JSON.parse(await readFile(`${out}/manifest.json`, "utf8"));
const hasher = createHash("sha256");
for (const dir of ["workflows", "lib"])
  for (const path of (await readdir(dir, { recursive: true }))
    .filter((p) => p.endsWith(".ts"))
    .sort()) {
    hasher.update(`${dir}/${path}`);
    hasher.update(await readFile(`${dir}/${path}`));
  }
const revision = hasher.digest("hex");
const stepIds = new Set(
  Object.values(manifest.steps).flatMap((x) =>
    Object.values(x).map((s) => s.stepId),
  ),
);
// Schedules come from vercel.json's crons: Vercel Cron calls GET /api/run/<slug>.
const crons = existsSync("vercel.json") ? JSON.parse(await readFile("vercel.json", "utf8")).crons ?? [] : [];
const registry = registrySource().map(({ intake, startedBy, ...entry }) => {
  validateBusinessGraph(entry.businessGraph);
  validateDescription(entry);
  validateDataSharing(entry);
  const compiled =
    manifest.workflows[`workflows/${entry.source}.ts`]?.[entry.exportName];
  if (!compiled) throw Error(`No compiled workflow identity for ${entry.slug}`);
  const graph = entry.graph ?? compiled.graph;
  const nodes = new Set(graph?.nodes.map((n) => n.id));
  for (const n of graph?.nodes ?? [])
    if (n.data.stepId && !stepIds.has(n.data.stepId))
      throw Error(`Unknown step ${n.data.stepId}`);
  for (const e of graph?.edges ?? [])
    if (!nodes.has(e.source) || !nodes.has(e.target))
      throw Error("Unknown graph edge");
  for (const m of entry.mappings ?? [])
    if (!nodes.has(m.nodeId) || !stepIds.has(m.stepName))
      throw Error("Invalid call-site mapping");
  const assigned = new Set(),
    stageIds = new Set();
  for (const stage of entry.stages ?? []) {
    if (
      !stage.id ||
      nodes.has(stage.id) ||
      stageIds.has(stage.id) ||
      !stage.title?.trim() ||
      !stage.description?.trim() ||
      !stage.nodes?.length
    )
      throw Error("Invalid business stage");
    stageIds.add(stage.id);
    for (const id of stage.nodes) {
      if (!nodes.has(id) || assigned.has(id))
        throw Error("Unknown or multiply assigned stage node");
      assigned.add(id);
    }
  }
  const schedule = crons.find((c) => c.path === `/api/run/${entry.slug}`)?.schedule;
  const trigger = { ...(schedule ? { schedule } : {}), ...(intake ? { webhook: true } : {}), ...(startedBy ? { startedBy } : {}) };
  return { ...entry, workflowName: compiled.workflowId, graph, revision, trigger };
});
// A stage that one workflow starts shows nested under it: the Workflows page and its breadcrumbs read `parent`.
const parents = stageParents(registry);
for (const entry of registry)
  if (parents.has(entry.slug)) entry.parent = registry.find((e) => e.slug === parents.get(entry.slug)).id;
let groups;
try { groups = groupsSource(registry); }
catch (error) {
  // The reason alone, on the last line: the dev server's log shows the build's last lines.
  console.error(error.message);
  process.exit(1);
}
await writeFile(`${out}/registry.json`, JSON.stringify(registry));
await writeFile(`${out}/groups.json`, JSON.stringify(groups));
await bundleViewer();
