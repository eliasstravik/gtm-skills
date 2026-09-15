import { BaseBuilder, createBaseBuilderConfig } from "@workflow/builders";
import { build } from "esbuild";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { registrySource } from "./viewer-registry.mjs";
const out = "node_modules/.gtm-viewer";
await mkdir(out, { recursive: true });
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
const registry = registrySource().map((entry) => {
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
  return { ...entry, workflowName: compiled.workflowId, graph, revision };
});
await writeFile(`${out}/registry.json`, JSON.stringify(registry));
await mkdir("public/viewer-assets", { recursive: true });
await build({
  entryPoints: ["viewer/app.tsx"],
  outfile: "public/viewer-assets/app.js",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
