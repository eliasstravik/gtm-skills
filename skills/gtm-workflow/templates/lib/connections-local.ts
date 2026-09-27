import { existsSync, readFileSync } from "node:fs";
import { chmod, open, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { providerVariable } from "./connections-contract";
import { insist } from "./connections-access";

/**
 * The local Keys page's store, like any Vercel app's: `workflows/.env.local`, plain text, gitignored. The page edits
 * that file and nothing else: it never writes to Vercel, so a teammate's keys stay theirs. Linked to Vercel, the
 * shared Development variables come down with `vercel env pull`, which replaces the file, as it does in any Vercel app.
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

export type LocalChange = { action: "add" | "replace" | "disconnect"; variable: string; value?: string };
export async function changeLocalKey(input: LocalChange) {
  insist(providerVariable(input.variable), "invalid_provider_variable", 400);
  insist(input.action === "disconnect" || (typeof input.value === "string" && input.value.trim().length > 0 && input.value.length <= 8192 && !/[\r\n\0]/.test(input.value)), "invalid_key", 400);
  await writeEnvLocal(editEnv(readEnvFile(".env.local"), input.variable, input.action === "disconnect" ? null : input.value!));
  return { saved: true, store: "file" as const };
}
