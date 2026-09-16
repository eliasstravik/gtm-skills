// Exercise Create -> Update registration and compilation without running a workflow or migration.
import {
  mkdtemp,
  cp,
  symlink,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const runtime = resolve(process.argv[2]);
const dir = await mkdtemp(join(tmpdir(), "gtm-authoring-"));
function run(script, success = true) {
  const result = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf8",
  });
  assert.equal(result.status === 0, success, result.stdout + result.stderr);
}
try {
  for (const name of [
    "lib",
    "scripts",
    "viewer",
    "connections-ui",
    "db",
    "package.json",
    "tsconfig.json",
  ])
    await cp(join(runtime, name), join(dir, name), { recursive: true });
  await mkdir(join(dir, "node_modules"));
  for (const name of await readdir(join(runtime, "node_modules")))
    if (!name.startsWith(".") || name === ".bin")
      await symlink(
        join(runtime, "node_modules", name),
        join(dir, "node_modules", name),
      );
  await mkdir(join(dir, "workflows"));
  await writeFile(
    join(dir, "workflows/proof.ts"),
    'export async function proof(input: { approved: boolean }) {\n  "use workflow";\n  return "Ready";\n}',
  );
  const graph = {
    nodes: [
      {
        id: "ready",
        label: "Ready for review",
        kind: "output",
        explanation: "Return a result for review.",
      },
    ],
    edges: [],
  };
  await writeFile(
    join(dir, "workflows/index.ts"),
    `import { proof } from './proof'; export const workflows = { proof: { run: proof, viewer: { description: 'Prepare a review.', businessGraph: ${JSON.stringify(graph)} } } };`,
  );
  run("scripts/viewer-registry.mjs");
  run("scripts/build-viewer.mjs");
  const registry = async () =>
    JSON.parse(
      await readFile(
        join(dir, "node_modules/.gtm-viewer/registry.json"),
        "utf8",
      ),
    );
  const id = (await registry())[0].id;
  assert.match(id, /^[a-f0-9-]{36}$/);
  await writeFile(
    join(dir, "workflows/proof.ts"),
    'export async function proof(input: { approved: boolean }) {\n  "use workflow";\n  if (input.approved) return "Ready";\n  return "Needs review";\n}',
  );
  graph.nodes.unshift({
    id: "approved",
    label: "Approved?",
    kind: "decision",
    explanation: "Check the supplied approval.",
  });
  graph.nodes.push({
    id: "review",
    label: "Needs review",
    kind: "output",
    explanation: "Return the result for another review.",
  });
  graph.edges.push(
    { id: "yes", source: "approved", target: "ready", label: "Yes" },
    { id: "no", source: "approved", target: "review", label: "No" },
  );
  await writeFile(
    join(dir, "workflows/index.ts"),
    `import { proof } from './proof'; export const workflows = { proof: { run: proof, viewer: { id: ${JSON.stringify(id)}, description: 'Prepare an approved result.', businessGraph: ${JSON.stringify(graph)} } } };`,
  );
  run("scripts/viewer-registry.mjs");
  run("scripts/build-viewer.mjs");
  assert.equal((await registry())[0].id, id);
  assert.equal((await registry())[0].businessGraph.edges.length, 2);
  const path = join(dir, "workflows/index.ts");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("businessGraph:", "missingGraph:"),
  );
  run("scripts/build-viewer.mjs", false);
  console.log(
    "Create and Update preserve identity, compile the new business branch, and reject missing metadata. No workflow executed.",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
