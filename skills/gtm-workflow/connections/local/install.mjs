import { createHash } from "node:crypto";
import { cp, readFile, readdir, lstat, chmod, rename, mkdtemp, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { privateDirectory, privateJson, writePrivateJson } from "./state.mjs";
import { requireThat } from "../src/errors.mjs";
import { inspectionEnvironment } from "./inspection-environment.mjs";
export const componentSource = dirname(dirname(fileURLToPath(import.meta.url)));
export function sourceProvenance(source) {
  const git = (args) => spawnSync("git", args, { cwd: source, env: inspectionEnvironment(process.env), encoding: "utf8", stdio: "pipe" });
  if (git(["ls-files", "--error-unmatch", "package.json"]).status !== 0) return { sourceCommit: null, development: true };
  const head = git(["rev-parse", "HEAD"]), commit = head.stdout?.trim();
  if (head.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) return { sourceCommit: null, development: true };
  const status = git(["status", "--porcelain", "--untracked-files=all", "--", ".", "../templates"]);
  requireThat(status.status === 0, "source_provenance_unavailable", 503);
  return { sourceCommit: commit, development: Boolean(status.stdout.trim()) };
}
async function files(path, prefix = "") {
  const entries = [];
  for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (["node_modules", ".vercel", ".git"].includes(entry.name)) continue;
    requireThat(!entry.isSymbolicLink(), "symlink_in_component");
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...await files(join(path, entry.name), name)); else entries.push(name);
  }
  return entries;
}
export async function componentDigest(source) {
  const hash = createHash("sha256");
  for (const file of await files(source)) {
    if (file === "installation.json") continue;
    const data = await readFile(join(source, file));
    hash.update(JSON.stringify([file.replaceAll("\\", "/"), data.length])); hash.update(data);
  }
  return hash.digest("hex");
}
export async function sourceDigest(source) {
  const hash = createHash("sha256");
  for (const file of await files(source)) {
    if (["release.json", "installation.json", "provenance.json"].includes(file) || file.startsWith("dist/")) continue;
    const data = await readFile(join(source, file));
    hash.update(JSON.stringify([file.replaceAll("\\", "/"), data.length])); hash.update(data);
  }
  return hash.digest("hex");
}
export async function installationProvenance(source) {
  const checkout = sourceProvenance(source);
  let release;
  try { release = JSON.parse(await readFile(join(source, "release.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (release) {
    const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
    requireThat(release.version === version && /^[a-f0-9]{40}$/.test(release.sourceCommit) && /^[a-f0-9]{64}$/.test(release.sourceDigest), "invalid_release_provenance", 403);
    if (await sourceDigest(source) === release.sourceDigest && (!checkout.sourceCommit || !checkout.development))
      return { sourceCommit: release.sourceCommit, development: false };
  }
  return checkout;
}
export async function installComponent(source = componentSource) {
  const version = JSON.parse(await readFile(join(source, "package.json"))).version;
  const provenance = await installationProvenance(source);
  requireThat(/^\d+\.\d+\.\d+$/.test(version), "invalid_component_version");
  const root = await privateDirectory(join(homedir(), ".gtm", "components"));
  const temporary = await mkdtemp(join(root, ".build-"));
  try {
  for (const file of await files(source)) {
    if (["installation.json", "provenance.json"].includes(file) || file.startsWith("dist/")) continue;
    await privateDirectory(dirname(join(temporary, file)));
    await cp(join(source, file), join(temporary, file), { errorOnExist: true, force: false });
  }
  const env = inspectionEnvironment(process.env);
  for (const cwd of [temporary, join(temporary, "local")]) {
    const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd, env, encoding: "utf8", stdio: "pipe", shell: process.platform === "win32" });
    requireThat(result.status === 0, "component_install_failed", 503);
  }
  const build = spawnSync(process.execPath, ["build.mjs"], { cwd: temporary, env, encoding: "utf8", stdio: "pipe" });
  requireThat(build.status === 0, "component_build_failed", 503);
  await writePrivateJson(join(temporary, "provenance.json"), provenance);
  const digest = await componentDigest(temporary), destination = join(root, `${version}-${digest}`);
  try {
    const stat = await lstat(destination);
    requireThat(stat.isDirectory() && !stat.isSymbolicLink(), "unsafe_component_directory", 403);
    const existing = await privateJson(join(destination, "installation.json"));
    requireThat(existing?.digest === digest && await componentDigest(destination) === digest, "component_digest_mismatch", 403);
    return { path: destination, digest, version, ...provenance };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  await writePrivateJson(join(temporary, "installation.json"), { version, digest, ...provenance });
  try { await rename(temporary, destination); }
  catch (error) {
    if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
    requireThat((await privateJson(join(destination, "installation.json")))?.digest === digest && await componentDigest(destination) === digest, "component_digest_mismatch", 403);
    return { path: destination, digest, version, ...provenance };
  }
  // Source is fixed by digest; updates always install another directory.
  for (const file of await files(destination)) await chmod(join(destination, file), 0o400);
  return { path: destination, digest, version, ...provenance };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
