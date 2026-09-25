import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Template-owned files at the workspace root. They live under `root/` without their leading dot, which skill installers drop.
// GitHub reads CI only from the repository root; the root ignore file keeps Vercel links and env files out of commits.
const root = join(dirname(dirname(fileURLToPath(import.meta.url))), "root");
export const rootFiles = [
  { path: ".gitignore", source: "gitignore" },
  { path: ".github/workflows/check.yml", source: "github/workflows/check.yml" },
];
/** Creates the root files a workspace lacks; an existing file is the workspace's own and is never overwritten. */
export async function writeRootFiles(workspace) {
  const created = [];
  for (const file of rootFiles) {
    const target = join(workspace, file.path);
    if (existsSync(target)) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(join(root, file.source)));
    created.push(file.path);
  }
  return created;
}
/** Lists root files that are missing or differ from the template, for Doctor to report. */
export async function rootFileDrift(workspace) {
  const drift = [];
  for (const file of rootFiles) {
    const target = join(workspace, file.path);
    if (!existsSync(target)) drift.push({ path: file.path, status: "missing" });
    else if (!(await readFile(target)).equals(await readFile(join(root, file.source)))) drift.push({ path: file.path, status: "differs" });
  }
  return drift;
}
