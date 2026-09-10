// gtm-lib v21
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const LIMIT = 64_000;
export function runGeneratorProcess(command, args, { cwd, timeoutMs = 60_000 } = {}) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = (stdout + chunk).slice(-LIMIT); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-LIMIT); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveResult({ code: timedOut ? 124 : code ?? 1, stdout, stderr, timedOut });
    });
  });
}

async function fingerprint(root) {
  const hash = createHash("sha256");
  async function visit(path, prefix = "") {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), key);
      else if (entry.isFile()) hash.update(key).update(await readFile(join(path, entry.name)));
      else throw new Error("Migration artifacts must be regular files.");
    }
  }
  await visit(root);
  return hash.digest("hex");
}

export async function generateMigration(root, args) {
  // Only the migration name and custom data migration mode are caller-controlled.
  // Configuration and output paths cannot bypass staging or input checks.
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--custom") continue;
    if (args[i] === "--name" && /^[a-zA-Z0-9_-]{1,80}$/.test(args[++i] ?? "")) continue;
    return { ok: false, error: { code: "invalid_arguments", message: "Use db:generate [--name migration_name] [--custom]." } };
  }
  const lock = join(root, ".gtm-migration-lock");
  try { await mkdir(lock); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return { ok: false, error: { code: "migration_busy", message: "Another generator owns the migration lock. Inspect that process before retrying or removing a stale lock." } };
  }
  let temporary;
  let preserveRecovery = false;
  try {
    const original = join(root, "drizzle");
    const before = await fingerprint(original);
    temporary = await mkdtemp(join(root, ".gtm-migration-"));
    const candidate = join(temporary, "drizzle");
    await cp(original, candidate, { recursive: true });
    const result = await runGeneratorProcess(process.execPath, [
      "--import", "tsx", join(root, "scripts/generate-migration-worker.ts"), candidate, ...args,
    ], { cwd: root });
    if (result.timedOut) return { ok: false, error: { code: "migration_timeout", message: "Migration generation exceeded 60 seconds and was terminated. No migration artifacts were installed. Inspect the schema imports before retrying." } };
    const line = result.stdout.trim().split("\n").at(-1);
    let report;
    try { report = JSON.parse(line); } catch { /* CLI output is diagnostic, never a success receipt. */ }
    if (result.code !== 0 || report?.ok !== true) {
      return report?.ok === false ? report : { ok: false, error: { code: "migration_failed", message: "Migration generation failed. No migration artifacts were installed.", diagnostic: result.stderr.slice(-4000) } };
    }
    if (await fingerprint(original) !== before) return { ok: false, error: { code: "migration_conflict", message: "Migration artifacts changed during generation. Nothing was installed; inspect and retry." } };
    if (await fingerprint(candidate) === before) return { ok: true, changed: false };
    const previous = join(temporary, "previous");
    await rename(original, previous);
    try { await rename(candidate, original); } catch (error) {
      try { await rename(previous, original); } catch {
        preserveRecovery = true;
        throw new Error(`Could not restore migration artifacts; recover them from ${previous}.`);
      }
      throw error;
    }
    return { ok: true, changed: true, message: "Migration SQL, journal, and snapshot generated. Review the SQL and obtain approval before applying it." };
  } finally {
    if (temporary && !preserveRecovery) await rm(temporary, { recursive: true, force: true });
    await rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await generateMigration(process.cwd(), process.argv.slice(2));
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({ ok: false, error: { code: "migration_failed", message: error.message } }));
    process.exitCode = 1;
  }
}
