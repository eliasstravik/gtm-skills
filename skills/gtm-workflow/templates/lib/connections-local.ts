import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { providerVariable } from "./connections-contract";
import { ConnectionsError, insist } from "./connections-access";
import { isProductionDatabase } from "../scripts/local-database.mjs";

/**
 * The local Keys page's store, like any Vercel app's: `workflows/.env.local`, plain text, gitignored.
 * Not linked to Vercel: the page edits that file. Linked (`workflows/.vercel/project.json`): the page saves to the
 * project's Development environment variables with the owner's Vercel CLI login and then `vercel env pull`s, so the
 * file is exactly Vercel's copy. Production and Preview variables are never read or written from here.
 * The running server keeps the keys it started with; a change applies at the next `npm run dev`.
 */
const root = () => process.cwd();
export const envLocalPath = () => join(root(), ".env.local");
export const linkedToVercel = () => existsSync(join(root(), ".vercel", "project.json"));

function readEnvFile(name: string) {
  try { return readFileSync(join(root(), name), "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
const keysIn = (text: string) => Object.entries(parseEnv(text)).filter(([name, value]) => providerVariable(name) && value?.trim()).map(([name]) => name);

/** The keys the running server has: provider variables it loaded from `.env` or `.env.local` (names only). */
export function localKeyNames(env: Record<string, string | undefined> = process.env) {
  return [...new Set([...keysIn(readEnvFile(".env")), ...keysIn(readEnvFile(".env.local"))])].filter((name) => env[name]?.trim()).sort();
}
/** The keys saved in `.env.local` now, whether or not the server has them yet. */
export const savedKeyNames = () => keysIn(readEnvFile(".env.local")).sort();

const assignment = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
/** One `NAME=value` line in place of the old ones, or none; comments and every other line stay as they are. */
export function editEnv(text: string, name: string, value: string | null) {
  insist(providerVariable(name), "invalid_provider_variable", 400);
  const quoted = value === null ? null : !value.includes("'") ? `'${value}'` : !value.includes('"') ? `"${value}"` : !value.includes("`") ? `\`${value}\`` : null;
  insist(value === null || quoted, "invalid_key", 400);
  const lines = text.split("\n"), result: string[] = [];
  let placed = false;
  for (const line of lines) {
    if (!assignment(name).test(line)) { result.push(line); continue; }
    if (quoted && !placed) { result.push(`${name}=${quoted}`); placed = true; }
  }
  if (quoted && !placed) {
    while (result.length && result[result.length - 1] === "") result.pop();
    result.push(`${name}=${quoted}`, "");
  }
  const next = result.join("\n");
  // The file must read back exactly: a value the dotenv format cannot hold is refused, never half written.
  insist(parseEnv(next)[name] === (value ?? undefined), "invalid_key", 400);
  return next;
}
/** Written beside the file and renamed over it, owner-only, so a crash never leaves half a file. */
async function writeEnvLocal(text: string) {
  const temporary = join(root(), `.env.local.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
  try { await rename(temporary, envLocalPath()); await chmod(envLocalPath(), 0o600); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

/** The owner's own Vercel CLI, in this folder (its link), a value only ever on stdin. */
function vercel(args: string[], input?: string) {
  return new Promise<string>((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("VERCEL")));
    const child = spawn("vercel", [...args, "--non-interactive"], { cwd: root(), env, stdio: ["pipe", "pipe", "pipe"], timeout: 120_000 });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.resume();
    child.on("error", () => reject(new ConnectionsError("vercel_cli_unavailable", 503)));
    child.on("close", (code) => code === 0 ? resolve(out) : reject(new ConnectionsError("vercel_request_denied", 503)));
    child.stdin.end(input ?? "");
  });
}
async function developmentNames() {
  let result: { envs?: { key?: unknown }[] };
  try { result = JSON.parse(await vercel(["env", "ls", "development", "--format", "json"])); }
  catch (error) { throw error instanceof ConnectionsError ? error : new ConnectionsError("vercel_unavailable", 503); }
  insist(Array.isArray(result.envs), "vercel_unavailable", 503);
  return new Set(result.envs.map((row) => String(row.key)));
}
const DATABASE_VARIABLE = /^(?:DATABASE_URL|POSTGRES_|PG)/;

/**
 * `vercel env pull` for the Development environment, through a file of its own that replaces `.env.local` only when
 * it passes the production guard: a pulled database variable must point at a database that is not production's
 * (a Neon development branch connected to Development on purpose), else nothing is replaced and the page says how
 * to fix the integration.
 */
export async function pullDevelopment() {
  const temporary = `.vercel/.env.pull.${randomUUID()}`;
  try {
    await vercel(["env", "pull", temporary, "--environment=development", "--yes"]);
    // The CLI writes it with the default mode; owner-only before anything reads it.
    await chmod(join(root(), temporary), 0o600);
    const pulled = parseEnv(await readFile(join(root(), temporary), "utf8"));
    for (const [name, value] of Object.entries(pulled).filter(([name]) => DATABASE_VARIABLE.test(name))) {
      if (!value || !/^postgres(?:ql)?:\/\//.test(value)) continue;
      // An unreachable database counts as production: the guard never passes on doubt.
      const production = await isProductionDatabase(value).catch(() => true);
      if (production) throw new ConnectionsError("production_database_in_development", 409);
    }
    await writeEnvLocal(await readFile(join(root(), temporary), "utf8"));
  } finally { await rm(join(root(), temporary), { force: true }); }
}

export type LocalChange = { action: "add" | "replace" | "disconnect"; variable: string; value?: string };
export async function changeLocalKey(input: LocalChange) {
  insist(providerVariable(input.variable), "invalid_provider_variable", 400);
  insist(input.action === "disconnect" || (typeof input.value === "string" && input.value.trim().length > 0 && input.value.length <= 8192 && !/[\r\n\0]/.test(input.value)), "invalid_key", 400);
  if (!linkedToVercel()) {
    await writeEnvLocal(editEnv(readEnvFile(".env.local"), input.variable, input.action === "disconnect" ? null : input.value!));
    return { saved: true, store: "file" as const };
  }
  const development = await developmentNames();
  // A pull replaces `.env.local` with Vercel's copy: keys saved only here go up to Development first, so the pull below
  // cannot lose them. Only keys: settings belong in `.env`, which no pull touches, and nothing else is published.
  const here = parseEnv(readEnvFile(".env.local"));
  for (const [name, value] of Object.entries(here))
    if (providerVariable(name) && !development.has(name) && name !== input.variable && value?.trim())
      await vercel(["env", "add", name, "development", "--no-sensitive", "--yes"], value!);
  if (input.action === "disconnect") {
    if (development.has(input.variable)) await vercel(["env", "rm", input.variable, "development", "--yes"]);
  } else if (development.has(input.variable)) {
    // `env update` changes the value in place; if it fails, the old value is still there.
    await vercel(["env", "update", input.variable, "development", "--yes"], input.value);
  } else await vercel(["env", "add", input.variable, "development", "--no-sensitive", "--yes"], input.value);
  // The key is saved on Vercel either way; a refused pull leaves the old `.env.local` and says why.
  await pullDevelopment();
  return { saved: true, store: "vercel-development" as const };
}
