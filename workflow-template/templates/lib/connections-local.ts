import { existsSync, readFileSync } from "node:fs";
import { chmod, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { providerVariable } from "./connections-contract";
import { insist } from "./connections-access";
import type { Release } from "./connections-apply";
import { LOADED_KEYS, fileKeys, keysFingerprint, reloadableKeys, shellKeyNames } from "./local-keys.mjs";

/**
 * The local Keys page's store, like any Vercel app's: `workflows/.env.local`, plain text, gitignored. The page edits
 * that file and nothing else: it never writes to Vercel, so a teammate's keys stay theirs. Linked to Vercel, the
 * shared Development variables come down with `vercel env pull`, which replaces the file, as it does in any Vercel app.
 * Under `npm run dev` a change applies on its own within seconds: the launcher reloads the server with the new keys
 * (scripts/local-launch.mjs). Under a bare `nitro dev` nothing reloads it, and the page says to restart.
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

export type LocalChange = { action: "add" | "replace" | "disconnect"; variable: string; value?: string };
export async function changeLocalKey(input: LocalChange) {
  insist(providerVariable(input.variable), "invalid_provider_variable", 400);
  insist(input.action === "disconnect" || (typeof input.value === "string" && input.value.trim().length > 0 && input.value.length <= 8192 && !/[\r\n\0]/.test(input.value)), "invalid_key", 400);
  await writeEnvLocal(editEnv(readEnvFile(".env.local"), input.variable, input.action === "disconnect" ? null : input.value!));
  return { saved: true, store: "file" as const };
}

/** Whether this server reloads itself when keys are saved: started by `npm run dev`, which records the keys it loaded. */
export const reloadsOnSave = (env: Record<string, string | undefined> = process.env) => Boolean(env[LOADED_KEYS]);

/**
 * Saved keys the server does not use because the shell that started `npm run dev` supplies its own value, which wins
 * over both files: saving or deleting one changes nothing until the app starts without it.
 */
export function shellKeptKeys(env: Record<string, string | undefined> = process.env) {
  if (!reloadsOnSave(env)) return [];
  const saved = fileKeys(root());
  return shellKeyNames(env).filter((name) => saved[name] !== undefined && saved[name] !== env[name]);
}
/** Whether a save of this key is overruled by the shell's own value. */
export const keptByShell = (name: string, env: Record<string, string | undefined> = process.env) => reloadsOnSave(env) && shellKeyNames(env).includes(name);

/** A reload that has not happened by then never will: the badge says so rather than spin. */
const RELOAD_MS = 60000;
let behindSince: number | undefined;
/**
 * The local counterpart of production's release status: "updating" from a save until the server runs with what is
 * saved, which takes a few seconds, then "live". Only a state and a time leave this function, never a key or its hash.
 */
export function localRelease(env: Record<string, string | undefined> = process.env, now = Date.now()): Release | null {
  if (!reloadsOnSave(env)) return null;
  let saved: string;
  try { saved = keysFingerprint(reloadableKeys(root(), shellKeyNames(env))); } catch { return null; }
  if (saved === env[LOADED_KEYS]) { behindSince = undefined; return { state: "live" }; }
  behindSince ??= now;
  return { state: now - behindSince < RELOAD_MS ? "updating" : "failed", since: behindSince };
}
