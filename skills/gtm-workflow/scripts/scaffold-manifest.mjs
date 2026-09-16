import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
export async function scaffoldManifest(root, prefix = "workflows") {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("Scaffold must contain ordinary files.");
    const path = join(root, entry.name), name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await scaffoldManifest(path, name));
    else files.push({ path: name, digest: createHash("sha256").update(await readFile(path)).digest("hex") });
  }
  return files;
}
