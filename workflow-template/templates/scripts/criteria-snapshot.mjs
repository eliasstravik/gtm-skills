// Bakes the workspace's ICP and persona files into lib/criteria.generated.ts, which lib/criteria.ts reads on the
// deployed copy (the function holds nothing outside workflows/). Locally lib/criteria.ts reads the files themselves.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const KINDS = [["icps", "ICP.md"], ["personas", "PERSONA.md"]];

/** `cwd` is `workflows/`; its parent is the workspace root. Returns the paths it baked. */
export async function writeCriteriaSnapshot(cwd = process.cwd()) {
  const root = resolve(cwd, ".."), files = {};
  for (const [dir, file] of KINDS) {
    if (!existsSync(join(root, dir))) continue;
    for (const slug of (await readdir(join(root, dir))).sort()) {
      const path = `${dir}/${slug}/${file}`;
      if (existsSync(join(root, path))) files[path] = await readFile(join(root, path), "utf8");
    }
  }
  const file = join(cwd, "lib/criteria.generated.ts");
  const text = `// Written by scripts/build-viewer.mjs from the workspace's icps/ and personas/ at every build; do not edit.\nconst files: Record<string, string> = ${JSON.stringify(files, null, 2)};\nexport default files;\n`;
  // Unchanged content is not rewritten: the dev watcher rebuilds on every write under lib/.
  if ((await readFile(file, "utf8").catch(() => "")) !== text) await writeFile(file, text);
  return Object.keys(files);
}
