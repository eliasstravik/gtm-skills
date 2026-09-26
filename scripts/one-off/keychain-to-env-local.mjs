#!/usr/bin/env node
// One-off rollout script for the local/production plan, step 2 (deleted after the rollout; workspaces never carry it).
// Moves a workspace's keys from the OS credential store (macOS Keychain, Linux Secret Service), where the retired
// Connections component kept them, into `workflows/.env.local`, then removes the component's state.
//
//   node keychain-to-env-local.mjs --workspace <path>            show what would move (names only)
//   node keychain-to-env-local.mjs --workspace <path> --apply    move, verify, then delete the old items and state
//
// Values are never printed. Every copied name is verified in `.env.local` before anything is deleted.
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { chmod, open, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";

const { values } = parseArgs({ options: { workspace: { type: "string" }, apply: { type: "boolean" } } });
if (!values.workspace) throw Error("--workspace <path> is required");
const workspace = realpathSync(resolve(values.workspace)), runtime = join(workspace, "workflows"), gtm = join(homedir(), ".gtm");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const bindingPath = join(gtm, "connections", "bindings", `${createHash("sha256").update(workspace).digest("hex")}.json`);
const id = existsSync(bindingPath) ? readJson(bindingPath).id : readJson(join(gtm, "connections", "workspaces.json"))[workspace];
if (!/^[0-9a-f-]{36}$/.test(id ?? "")) throw Error(`No Connections binding for ${workspace}: nothing to move.`);
const state = join(gtm, "connections", id), config = readJson(join(state, "config.json"));
const keyring = createRequire(join(config.component.path, "local", "package.json"))("@napi-rs/keyring");
const service = `gtm-connections/${id}/local`, setupService = `gtm-connections/${id}/setup/local`;
const INTERNAL = (name) => ["GTM_CONNECTIONS_READ_SECRET", "GTM_RUN_SECRET"].includes(name) || name.startsWith("PRIVATE_PROJECT_TOKEN_");
const items = keyring.findCredentials(service), setupItems = keyring.findCredentials(setupService);
const copy = items.filter((item) => !INTERNAL(item.account) && item.password.trim());
const drop = [...items.filter((item) => !copy.includes(item)).map((item) => item.account), ...setupItems.map((item) => `(setup) ${item.account}`)];
const linked = existsSync(join(runtime, ".vercel", "project.json"));
console.log(JSON.stringify({ workspace, linked, copy: copy.map((item) => item.account).sort(), drop: drop.sort() }));
if (!values.apply) process.exit(0);

// Linked: Development first, so a later `vercel env pull` brings the same keys back rather than wiping them.
if (linked) {
  const vercel = (args, input) => spawnSync("vercel", [...args, "--non-interactive"], { cwd: runtime, input, encoding: "utf8", stdio: "pipe" });
  const listed = vercel(["env", "ls", "development", "--format", "json"]);
  if (listed.status !== 0) throw Error("vercel env ls development failed: sign in with `vercel login`");
  const development = new Set(JSON.parse(listed.stdout).envs.map((row) => row.key)), conflicts = [];
  for (const item of copy) {
    if (development.has(item.account)) { conflicts.push(item.account); continue; }
    if (vercel(["env", "add", item.account, "development", "--no-sensitive", "--yes"], item.password).status !== 0) throw Error(`vercel env add ${item.account} failed`);
  }
  if (conflicts.length) console.log(JSON.stringify({ alreadyInDevelopment: conflicts }));
}

// Merge into `.env.local`: the Keychain value wins (it is what local runs used), every other line stays.
const path = join(runtime, ".env.local");
let text = existsSync(path) ? readFileSync(path, "utf8") : "";
for (const item of copy) {
  const value = item.password, quoted = !value.includes("'") ? `'${value}'` : !value.includes('"') ? `"${value}"` : `\`${value}\``;
  const line = new RegExp(`^\\s*(?:export\\s+)?${item.account}\\s*=`);
  const kept = text.split("\n").filter((row) => !line.test(row));
  while (kept.length && kept[kept.length - 1] === "") kept.pop();
  text = [...kept, `${item.account}=${quoted}`, ""].join("\n");
}
const temporary = join(runtime, `.env.local.${randomUUID()}.tmp`), file = await open(temporary, "wx", 0o600);
try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
await rename(temporary, path); await chmod(path, 0o600);
const written = parseEnv(readFileSync(path, "utf8"));
const missing = copy.filter((item) => written[item.account] !== item.password).map((item) => item.account);
if (missing.length) throw Error(`Not verified in .env.local, nothing deleted: ${missing.join(", ")}`);

for (const item of items) new keyring.Entry(service, item.account).deleteCredential();
for (const item of setupItems) new keyring.Entry(setupService, item.account).deleteCredential();
await rm(state, { recursive: true, force: true });
await rm(bindingPath, { force: true });
// The component install goes once no other workspace is bound to it.
const others = readdirSync(join(gtm, "connections")).filter((name) => /^[0-9a-f-]{36}$/.test(name) && existsSync(join(gtm, "connections", name, "config.json")));
if (!others.length) {
  await rm(join(gtm, "components"), { recursive: true, force: true });
  await rm(join(gtm, "connections"), { recursive: true, force: true });
}
console.log(JSON.stringify({ moved: copy.length, verified: true, removedComponents: !others.length, otherWorkspacesStillBound: others.length }));
