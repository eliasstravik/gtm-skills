// Resolve only an already installed component from owner-controlled state.
import { readFile, realpath, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const root = join(homedir(), ".gtm"), workspace = await realpath(resolve(".."));
async function read(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid())) throw Error("Unsafe local component state.");
  return JSON.parse(await readFile(path, "utf8"));
}
try {
  let id;
  try {
    const binding = await read(join(root, "connections/bindings", `${createHash("sha256").update(workspace).digest("hex")}.json`));
    if (binding.workspace !== workspace) throw Error("Workspace binding mismatch.");
    id = binding.id;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    id = (await read(join(root, "connections/workspaces.json")))[workspace];
  }
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error();
  const config = await read(join(root, "connections", id, "config.json")), component = config.component;
  if (!component || !/^[0-9a-f]{64}$/.test(component.digest) || dirname(component.path) !== join(root, "components") || config.workspace !== workspace) throw Error();
  const { componentDigest } = await import(pathToFileURL(join(component.path, "local/install.mjs")));
  if (await componentDigest(component.path) !== component.digest) throw Error();
  const { launch } = await import(pathToFileURL(join(component.path, "local/launch.mjs")));
  await launch(workspace, process.argv[2] === "viewer" ? "viewer" : "dev");
} catch {
  console.error("Local runtime unavailable. Run the installed gtm-workflow setup and Connections Doctor.");
  process.exitCode = 1;
}
