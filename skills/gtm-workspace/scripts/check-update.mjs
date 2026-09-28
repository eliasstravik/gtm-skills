#!/usr/bin/env node
// Is a newer GTM Skills release out? Run once per conversation, by the first gtm skill used (references/updates.md).
//   node check-update.mjs            prints one JSON line, always exits 0
// The installed version is the lowest `metadata.version` among the gtm skills next to this one, so a half-updated
// install counts as old. On a computer the latest is gtm-skills main; on the hosted agent (GTM_AGENT_HOSTED=1) it is the
// release the agent template pins, since upgrading the agent is how its skills change. Offline, slow or unreadable:
// "unknown", which the agent never mentions. GTM_SKIP_UPDATE_CHECK=1 turns the check off (CI, evals).
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILLS_REPO = "eliasstravik/gtm-skills";
export const AGENT_REPO = "eliasstravik/gtm-agent";
const RAW = "https://raw.githubusercontent.com";
const skillsDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** The `metadata.version` of a SKILL.md's frontmatter, or null. */
export function skillVersion(text) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  return /^metadata:\s*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+version:\s*["']?(\d+\.\d+\.\d+)["']?\s*$/m.exec(front + "\n")?.[1] ?? null;
}

/** -1, 0 or 1 for two x.y.z versions; a missing one counts as 0.0.0. */
export function compareVersions(a, b) {
  const parts = (v) => (/^\d+\.\d+\.\d+/.test(v ?? "") ? v.split(".").slice(0, 3).map(Number) : [0, 0, 0]);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** The lowest version among the installed gtm skills in `dir`; a gtm skill without one counts as 0.0.0. */
export function installedVersion(dir = skillsDir) {
  const versions = readdirSync(dir).filter((name) => name.startsWith("gtm-")).flatMap((name) => {
    try { return [skillVersion(readFileSync(join(dir, name, "SKILL.md"), "utf8")) ?? "0.0.0"]; } catch { return []; }
  });
  return versions.sort(compareVersions)[0] ?? null;
}

/** The gtm-skills commit the agent template's build installs, from its package.json. */
export function agentSkillsPin(packageJson) {
  const build = JSON.parse(packageJson).scripts?.build ?? "";
  return new RegExp(`${SKILLS_REPO}#([0-9a-f]{7,40})`).exec(build)?.[1] ?? null;
}

/** A global install lives in a dot folder of the home directory (~/.agents/skills, ~/.config/opencode/skills). */
export function isGlobal(dir = skillsDir, home = homedir()) {
  const real = (path) => { try { return realpathSync(path); } catch { return path; } };
  for (const [path, base] of [[dir, home], [real(dir), real(home)]]) {
    const parts = relative(base, path).split(sep);
    if (parts[0]?.startsWith(".") && parts[0] !== ".." && parts.length <= 3) return true;
  }
  return false;
}

/** What to tell the agent, from the installed and latest versions. */
export function decide({ installed, latest, hosted = false, global = true }) {
  if (!installed || !latest) return { status: "unknown" };
  if (compareVersions(installed, latest) >= 0) return { status: "current", installed };
  if (hosted) return { status: "update_available", installed, latest, hosted: true };
  return { status: "update_available", installed, latest, command: `npx skills add ${SKILLS_REPO}${global ? " -g" : ""} -y` };
}

async function fetchText(url, timeoutMs) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** The newest released version: gtm-skills main on a computer, the agent template's pin on the hosted agent. */
export async function latestVersion({ hosted = false, get = (url) => fetchText(url, 3000) } = {}) {
  const ref = hosted ? agentSkillsPin(await get(`${RAW}/${AGENT_REPO}/main/package.json`)) : "main";
  if (!ref) return null;
  return skillVersion(await get(`${RAW}/${SKILLS_REPO}/${ref}/skills/gtm-workspace/SKILL.md`));
}

export async function checkForUpdate({ dir = skillsDir, env = process.env, get } = {}) {
  if (env.GTM_SKIP_UPDATE_CHECK === "1") return { status: "skipped" };
  const hosted = env.GTM_AGENT_HOSTED === "1";
  try {
    const installed = installedVersion(dir);
    return decide({ installed, latest: await latestVersion({ hosted, get }), hosted, global: isGlobal(dir) });
  } catch {
    return { status: "unknown" };
  }
}

// Compare real paths: ~/.claude/skills is often a link to ~/.agents/skills, and import.meta.url is the resolved one.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await checkForUpdate()));
