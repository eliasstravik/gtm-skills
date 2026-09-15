// Shared helpers for setup.mjs and doctor.mjs: shell out to gh and vercel, talk to the Vercel API through the CLI,
// and print one line per step. No secret is ever printed; values go straight into `vercel env add`.
import { spawnSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export { REQUIRED_EVENTS, REQUIRED_SCOPES } from "./slack-config.mjs";
export const TEMPLATE_REPO = "eliasstravik/gtm-agent";
export const TRIGGER_PATH = "/eve/v1/slack";

export function parseArgs(argv, spec) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    if (spec.flags?.includes(key)) { out[key] = true; continue; }
    if (key.startsWith("no-") && spec.flags?.includes(key.slice(3))) { out[key.slice(3)] = false; continue; }
    out[key] = argv[++i];
  }
  return out;
}

export function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

export const say = (line) => console.log(line);
export const ok = (line) => console.log(`✓ ${line}`);
export const todo = (line) => console.log(`→ ${line}`);

/** Run a command; returns { status, stdout, stderr }. Never throws. */
export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", cwd: opts.cwd, env: { ...process.env, ...opts.env }, input: opts.input, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** Run a command that must succeed; returns stdout. */
export function must(cmd, args, opts = {}) {
  const r = run(cmd, args, opts);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout}`);
  return r.stdout;
}

export const gh = (args, opts) => must("gh", args, opts);
export const ghJson = (args, opts) => JSON.parse(gh(args, opts) || "null");

/** vercel with the team scope and no prompts. */
export function vercel(args, { team, cwd, input, allowFail } = {}) {
  const full = [...args, "--non-interactive", ...(team ? ["--scope", team] : [])];
  const r = run("vercel", full, { cwd, input });
  if (r.status !== 0 && !allowFail) fail(`vercel ${args.join(" ")}\n${r.stderr || r.stdout}`);
  return r;
}

/** Vercel REST API through the CLI's own login: api(team, "GET", "/v9/projects/x") -> parsed JSON (null on 404). */
export function api(team, method, path, body, { allowFail } = {}) {
  const args = ["api", path, "-X", method, "--raw"];
  let tmp;
  if (body !== undefined) {
    tmp = mkdtempSync(join(tmpdir(), "gtm-agent-"));
    writeFileSync(join(tmp, "body.json"), JSON.stringify(body));
    args.push("--input", join(tmp, "body.json"));
  }
  const r = vercel(args, { team, allowFail: true });
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (r.status !== 0) {
    if (allowFail || /404|not[_ ]found/i.test(r.stdout + r.stderr)) return null;
    fail(`vercel api ${method} ${path}\n${r.stderr || r.stdout}`);
  }
  const text = r.stdout.trim();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export const project = (team, name) => api(team, "GET", `/v9/projects/${encodeURIComponent(name)}`, undefined, { allowFail: true });

export function envNames(team, name) {
  const r = api(team, "GET", `/v9/projects/${encodeURIComponent(name)}/env`, undefined, { allowFail: true });
  return new Set((r?.envs ?? []).map((e) => e.key));
}

/** Set a production variable; `force` overwrites. Value never echoed. */
export function setEnv(team, projectName, key, value, { secret = true, force = false } = {}) {
  const args = ["env", "add", key, "production", "--project", projectName, "--value", value, secret ? "--sensitive" : "--no-sensitive", "--yes"];
  if (force) args.push("--force");
  const r = vercel(args, { team, allowFail: true });
  if (r.status !== 0 && !/already exists/i.test(r.stderr + r.stdout)) fail(`vercel env add ${key} on ${projectName}\n${r.stderr || r.stdout}`);
  return r.status === 0;
}

export function removeEnv(team, projectName, key) {
  vercel(["env", "rm", key, "production", "--project", projectName, "--yes"], { team, allowFail: true });
}

export function connectors(team) {
  return api(team, "GET", "/v1/connect/connectors", undefined, { allowFail: true })?.clients ?? [];
}

/** The production URL of a project after its first deployment, else null. */
export function productionUrl(team, name) {
  const p = project(team, name);
  const aliases = p?.targets?.production?.alias ?? [];
  // The first alias is the deployment's canonical vercel.app address; the "<name>-<team>" and "-git-" ones sit behind SSO protection.
  const pick = aliases.find((a) => a === `${name}.vercel.app`) ?? aliases[0];
  return pick ? `https://${pick}` : null;
}

/** Start a production deployment from the linked git repository's main branch; returns the deployment id. */
export function deployFromGit(team, name) {
  const p = project(team, name);
  if (!p?.link?.repoId) fail(`${name} is not connected to a git repository`);
  const d = api(team, "POST", "/v13/deployments", { name, project: name, target: "production", gitSource: { type: p.link.type, repoId: p.link.repoId, ref: p.link.productionBranch || "main" } });
  return d?.id ?? d?.uid ?? null;
}

export async function waitForDeployment(team, id, { minutes = 12 } = {}) {
  const until = Date.now() + minutes * 60_000;
  while (Date.now() < until) {
    const d = api(team, "GET", `/v13/deployments/${id}`, undefined, { allowFail: true });
    const state = d?.readyState ?? d?.state;
    if (state === "READY") return d;
    if (state === "ERROR" || state === "CANCELED") fail(`Deployment ${id} ended ${state}: ${d?.errorMessage ?? "see the Vercel dashboard"}`);
    await sleep(8_000);
  }
  fail(`Deployment ${id} did not become ready in ${minutes} minutes`);
}

export function latestProductionDeployment(team, name) {
  const r = api(team, "GET", `/v6/deployments?projectId=${encodeURIComponent(name)}&target=production&limit=1`, undefined, { allowFail: true });
  return r?.deployments?.[0] ?? null;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function http(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), redirect: "manual" });
    return { status: res.status, text: await res.text().catch(() => "") };
  } catch (e) {
    return { status: 0, text: String(e) };
  }
}

/** Spawn a long command, stream its output to the console, resolve with the exit code. */
export function spawnStreaming(cmd, args, { cwd, onLine } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const feed = (chunk) => { const text = chunk.toString(); process.stdout.write(text); onLine?.(text); };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

export function slugOk(slug) {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 40;
}
