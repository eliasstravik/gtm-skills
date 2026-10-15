#!/usr/bin/env node
// The workflow project template: `templates/` (the runtime setup copies to <workspace>/workflows/) and `root/` (the
// workspace's root files). They are not shipped inside this skill, which is kept small enough for skill loaders that
// fetch one file at a time; they live in the gtm-skills repository under workflow-template/ and are fetched once per
// release, from the tag v<metadata.version in SKILL.md>, never from a moving branch, into a local cache.
// `node scripts/template.mjs` prints {"version","ref","templates","root","source"}; exit 1 with the reason when it cannot.
// Sources, in order: GTM_WORKFLOW_TEMPLATE_DIR (a folder holding templates/ and root/, for tests), the repository
// checkout this skill sits in (development and CI), the cache, then a download: git first (it follows the machine's
// url.insteadOf rules, so the github.localhost proxy on exe.dev VMs), then the release tarball over HTTPS.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const self = fileURLToPath(import.meta.url);
const skill = dirname(dirname(self));
export const REPOSITORY = "eliasstravik/gtm-skills";
const FOLDER = "workflow-template";
const PARTS = ["templates", "root"];
// Shaped like hosted.mjs SetupError, so setup and doctor report the code and the reason as they do their own.
const fail = (code, message) => { throw Object.assign(Error(message), { name: "SetupError", code, status: 503, instruction: message }); };

/** metadata.version of this skill's SKILL.md: the release whose template this skill runs. */
export function skillVersion() {
  const version = /^\s+version:\s*"?(\d+\.\d+\.\d+)"?\s*$/m.exec(readFileSync(join(skill, "SKILL.md"), "utf8"))?.[1];
  return version ?? fail("template_version_unknown", `No metadata.version in ${join(skill, "SKILL.md")}`);
}

const cacheRoot = () => join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "gtm-skills", FOLDER);
const templateVersion = (dir) => { try { return JSON.parse(readFileSync(join(dir, "templates", "package.json"), "utf8")).version; } catch { return null; } };
const complete = (dir) => PARTS.every((part) => existsSync(join(dir, part))) && existsSync(join(dir, "templates", "package.json"));

/** A local copy that needs no download, or null: the override, then the repository checkout around this skill. */
function localCopy(version) {
  const override = process.env.GTM_WORKFLOW_TEMPLATE_DIR;
  if (override) {
    const dir = resolve(override);
    if (!complete(dir)) fail("template_override_invalid", `GTM_WORKFLOW_TEMPLATE_DIR=${dir} holds no templates/ and root/`);
    return { dir, source: "override" };
  }
  // skills/gtm-workflow/scripts -> the checkout's workflow-template/, used only when it is the same release.
  const checkout = join(dirname(dirname(skill)), FOLDER);
  if (complete(checkout) && templateVersion(checkout) === version) return { dir: checkout, source: "checkout" };
  return null;
}

/** The template folders for this skill's release, fetching them on first use. Synchronous, so any caller can use it. */
export function template() {
  const version = skillVersion(), ref = `v${version}`;
  let found = localCopy(version);
  if (!found) {
    const cached = join(cacheRoot(), ref);
    if (!complete(cached)) {
      const child = spawnSync(process.execPath, [self, "--fetch", ref], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 });
      if (child.status !== 0) {
        const reason = (() => { try { return JSON.parse(child.stderr.trim().split("\n").pop()); } catch { return null; } })();
        fail(reason?.code ?? "template_fetch_failed", reason?.message ?? (child.stderr || child.error?.message || "fetch failed").trim().slice(-300));
      }
    }
    found = { dir: cached, source: "cache" };
  }
  const got = templateVersion(found.dir);
  if (found.source !== "override" && got !== version)
    fail("template_version_mismatch", `The template at ${found.dir} is ${got}, this skill is ${version}`);
  return { version, ref, templates: join(found.dir, "templates"), root: join(found.dir, "root"), source: found.source };
}

// Skill installers drop dotfiles, and setup expects the template as they shipped it (gitignore, env.example), so a
// fetched copy leaves out every path with a dot-named part, as the copy inside the skill did before.
const kept = (path) => PARTS.some((part) => path === part || path.startsWith(`${part}/`)) && !path.split("/").some((name) => name.startsWith("."));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  return { ok: result.status === 0, error: (result.stderr || result.error?.message || "").trim().split("\n").slice(-2).join(" ") };
}

/** Copies the kept files of a checked-out tree's workflow-template/ into `into`. */
function copyKept(from, into, at = "") {
  for (const entry of readdirSync(join(from, at), { withFileTypes: true })) {
    const path = at ? `${at}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || !kept(path)) continue;
    if (entry.isDirectory()) { mkdirSync(join(into, path), { recursive: true }); copyKept(from, into, path); }
    else if (entry.isFile()) writeFileSync(join(into, path), readFileSync(join(from, path)));
  }
}

/** git clone of the tag, shallow. Honors the machine's git config, so github.localhost rewrites and credentials apply. */
function viaGit(ref, into, work) {
  const clone = join(work, "clone");
  const result = run("git", ["-c", "advice.detachedHead=false", "clone", "--quiet", "--depth", "1", "--branch", ref, "--single-branch",
    `https://github.com/${REPOSITORY}.git`, clone], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: 180_000 });
  if (!result.ok) return `git: ${result.error || "clone failed"}`;
  const tagged = spawnSync("git", ["-C", clone, "rev-parse", "--verify", "--quiet", `refs/tags/${ref}^{commit}`], { encoding: "utf8" });
  if (tagged.status !== 0) return `git: ${ref} is not a tag`;
  if (!existsSync(join(clone, FOLDER))) return `git: ${ref} has no ${FOLDER}/`;
  copyKept(join(clone, FOLDER), into);
  return null;
}

/** Minimal ustar/pax reader for GitHub release tarballs: regular files and directories only. */
function* tarEntries(buffer) {
  let offset = 0, longPath = null;
  const text = (start, length) => buffer.toString("utf8", start, start + length).replace(/\0.*$/s, "");
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8), type = text(offset + 156, 1) || "0";
    const prefix = text(offset + 345, 155), name = text(offset, 100);
    const body = buffer.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "x") { longPath = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString("utf8"))?.[1] ?? null; continue; }
    if (type === "g") continue;
    const path = longPath ?? (prefix ? `${prefix}/${name}` : name);
    longPath = null;
    if (type === "0" || type === "5") yield { path, directory: type === "5", body };
  }
}

/** The tag's tarball over HTTPS: through the machine's git rewrite of https://github.com/ when it has one, then direct. */
async function viaTarball(ref, into) {
  const bases = [];
  const rewrites = spawnSync("git", ["config", "--get-regexp", "^url\\..*\\.insteadof$"], { encoding: "utf8" }).stdout ?? "";
  for (const line of rewrites.split("\n")) {
    const match = /^url\.(.+)\.insteadof\s+https:\/\/github\.com\/?$/i.exec(line.trim());
    if (match) bases.push(match[1].replace(/\/?$/, "/"));
  }
  bases.push("https://github.com/");
  const errors = [];
  for (const base of bases) {
    const url = `${base}${REPOSITORY}/archive/refs/tags/${ref}.tar.gz`;
    try {
      const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(180_000) });
      if (!response.ok) { errors.push(`${url}: HTTP ${response.status}`); continue; }
      const files = [];
      for (const entry of tarEntries(gunzipSync(Buffer.from(await response.arrayBuffer())))) {
        const path = entry.path.split("/").slice(1).join("/"); // drop the <repo>-<ref>/ folder
        if (!path.startsWith(`${FOLDER}/`)) continue;
        const inner = path.slice(FOLDER.length + 1).replace(/\/$/, "");
        if (!inner || !kept(inner) || inner.split("/").includes("..")) continue;
        files.push({ ...entry, inner });
      }
      if (!files.some((file) => file.inner === "templates/package.json")) { errors.push(`${url}: no ${FOLDER}/templates/`); continue; }
      for (const file of files) {
        const target = join(into, file.inner);
        if (file.directory) mkdirSync(target, { recursive: true });
        else { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, file.body); }
      }
      return null;
    } catch (error) { errors.push(`${url}: ${error.message}`); }
  }
  return errors.join("; ");
}

/** Downloads the template at `ref` into the cache. Called in a child process by template(). */
async function fetchTemplate(ref) {
  if (!/^v\d+\.\d+\.\d+$/.test(ref)) fail("template_ref_invalid", `Templates are fetched only from a release tag, not ${ref}`);
  const target = join(cacheRoot(), ref);
  if (complete(target)) return target;
  mkdirSync(cacheRoot(), { recursive: true });
  const work = mkdtempSync(join(cacheRoot(), `.${ref}-`)), into = join(work, "template");
  try {
    const errors = [];
    for (const attempt of [() => viaGit(ref, into, work), () => viaTarball(ref, into)]) {
      rmSync(into, { recursive: true, force: true }); mkdirSync(into, { recursive: true });
      const error = await attempt();
      if (!error && complete(into)) break;
      errors.push(error ?? "incomplete download");
      if (errors.length === 2) fail("template_fetch_failed", `Could not fetch the workflow template ${ref} from github.com/${REPOSITORY}: ${errors.join(" | ")}`);
    }
    if (templateVersion(into) !== ref.slice(1)) fail("template_version_mismatch", `${ref} holds template ${templateVersion(into)}`);
    try { renameSync(into, target); } catch (error) { if (!complete(target)) throw error; } // another process won the race
    return target;
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === self) {
  const report = (error) => { console.error(JSON.stringify({ code: error.code ?? "template_failed", message: error.message })); process.exitCode = 1; };
  if (process.argv[2] === "--fetch") fetchTemplate(process.argv[3]).catch(report);
  else try { console.log(JSON.stringify(template())); } catch (error) { report(error); }
}
