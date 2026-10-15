// The keys a local server runs with, shared by the launcher (scripts/local-launch.mjs) and the server it starts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";

// PGHOST, PGUSER, PGPASSWORD and the rest carry no underscore; the Neon integration injects them (and NEON_PROJECT_ID) and node-postgres reads them as defaults.
const reserved = /^(?:PG[A-Z]|(?:GTM|VERCEL|NEXT|NEXT_PUBLIC|PUBLIC|VITE|NUXT|REACT_APP|DATABASE|POSTGRES|NEON|MYSQL|REDIS|KV|AWS|AZURE|GOOGLE_CLOUD|SUPABASE|CLERK|AUTH|SESSION|CRON|WORKFLOW|NITRO|H3|BASH|NODE|NPM|PNPM|YARN|BUN|DENO|LD|DYLD|PYTHON|XDG|SSL|OPENSSL|GIT|SSH|CI|SLACK_CONNECTOR)_)/i;
const system = /^(?:PATH|HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|TMPDIR|TMP|TEMP|LANG|LC_ALL|TERM|COLORTERM|PORT|HOST|HOSTNAME|SYSTEMROOT|APPDATA|LOCALAPPDATA|USERPROFILE|COMSPEC|PATHEXT|CI|SLACK_CONNECTOR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY|TZ|IFS|ENV|BASH_ENV)$/i;
export function providerVariable(name) {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(name) && !reserved.test(name) && !system.test(name);
}

/** Set by the launcher to the fingerprint of the keys this server was started with; absent under a bare `nitro dev`. */
export const LOADED_KEYS = "GTM_LOCAL_KEYS";

/** The keys `.env` and `.env.local` hold now, `.env.local` winning, as `npm run dev` loads them. Settings are not keys. */
export function fileKeys(dir) {
  const keys = {};
  for (const name of [".env", ".env.local"]) {
    let text;
    try { text = readFileSync(join(dir, name), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const [key, value] of Object.entries(parseEnv(text))) {
      // `vercel env pull` writes a bare VERCEL=1, which `npm run dev` never loads (scripts/local-launch.mjs).
      if (!providerVariable(key) || /^VERCEL/i.test(key)) continue;
      if (value?.trim()) keys[key] = value;
      else delete keys[key];
    }
  }
  return keys;
}

/** Set by the launcher to the names (never values) of the keys its shell supplied: those win over both files, always. */
export const SHELL_KEYS = "GTM_LOCAL_SHELL_KEYS";
export const shellKeyNames = (env) => (env[SHELL_KEYS] ?? "").split(",").filter(Boolean);

/** The saved keys a reload can put in use: a key the shell supplies keeps the shell's value, at start and after. */
export function reloadableKeys(dir, shellNames) {
  const keys = fileKeys(dir);
  for (const name of shellNames) delete keys[name];
  return keys;
}

/** A one-way summary of keys and values, so the server can tell whether it runs with what is saved without holding a copy. */
export function keysFingerprint(keys) {
  const hash = createHash("sha256");
  for (const name of Object.keys(keys).sort()) hash.update(`${name}\0${keys[name]}\0`);
  return hash.digest("hex").slice(0, 32);
}
