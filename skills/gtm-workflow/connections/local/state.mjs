import { lstat, mkdir, open, realpath, rename, readFile, link, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, relative, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { requireThat } from "../src/errors.mjs";
import { windowsState } from "./windows-state.mjs";

export async function privateDirectory(path, boundary = homedir()) {
  const base = await realpath(boundary), target = resolve(path);
  requireThat(target === base || (!relative(base, target).startsWith("..") && target.startsWith(base + sep)), "invalid_state_path");
  const parts = relative(base, target).split(sep).filter(Boolean);
  let current = base;
  for (const part of ["", ...parts]) {
    if (part) current = join(current, part);
    let created = false;
    try { await mkdir(current, { mode: 0o700 }); created = true; } catch (error) { if (error.code !== "EEXIST") throw error; }
    const stat = await lstat(current);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink() && (!process.getuid || stat.uid === process.getuid()) &&
      (process.platform === "win32" || !(stat.mode & 0o022)), "unsafe_state_directory", 403);
    windowsState(current, created ? "protect" : current === base ? "parent" : "check");
  }
  return target;
}
export async function privateJson(path, fallback = null) {
  try {
    const stat = await lstat(path);
    requireThat(stat.isFile() && !stat.isSymbolicLink() && (!process.getuid || stat.uid === process.getuid()) &&
      (process.platform === "win32" || !(stat.mode & 0o077)), "unsafe_state_file", 403);
    windowsState(path);
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
export async function writePrivateJson(path, value) {
  await privateJson(path);
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try { windowsState(temporary, "protect"); await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
}
export async function workspaceState(workspace, { create = false, root = join(homedir(), ".gtm"), boundary = homedir() } = {}) {
  await privateDirectory(join(root, "connections"), boundary);
  const canonical = await realpath(workspace);
  const bindings = await privateDirectory(join(root, "connections", "bindings"), boundary);
  const bindingPath = join(bindings, `${createHash("sha256").update(canonical).digest("hex")}.json`);
  let binding = await privateJson(bindingPath);
  if (!binding) {
    // Keep identities from earlier installations. New bindings are independent,
    // immutable files, so readers and registrations do not need a global lock.
    const legacy = (await privateJson(join(root, "connections", "workspaces.json"), {}))[canonical];
    requireThat(legacy || create, "run_local_setup", 409);
    const temporary = join(bindings, `.${randomUUID()}.tmp`);
    await writePrivateJson(temporary, { workspace: canonical, id: legacy ?? randomUUID() });
    try {
      try { await link(temporary, bindingPath); } catch (error) { if (error.code !== "EEXIST") throw error; }
      binding = await privateJson(bindingPath);
    } finally { await unlink(temporary); }
  }
  requireThat(binding.workspace === canonical && /^[0-9a-f-]{36}$/.test(binding.id), "invalid_workspace_identity");
  const id = binding.id, directory = await privateDirectory(join(root, "connections", id), boundary);
  return { id, workspace: canonical, directory, configPath: join(directory, "config.json"), database: join(directory, "operations.db") };
}
