#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const home = homedir();

export function classify(command, cwd = process.cwd()) {
  if (!command.trim() || /\$\(|`|\beval\b|\b(?:ba)?sh\s+-c\b|\bxargs\b|^\s*[A-Za-z_][A-Za-z0-9_]*=\S+\s+/.test(command)) return "ask";
  command = stripHeredoc(command); if (!command) return "ask";
  const parts = splitChain(command); if (!parts) return "ask";
  return parts.every((part) => classifyOne(part, cwd) === "allow") ? "allow" : "ask";
}

function classifyOne(command, cwd) {
  const redirections = [...command.matchAll(/(?:^|\s)(?:>>?|<)\s*([^\s;|&]+)/g)];
  if (redirections.some((match) => !safePath(match[1].replace(/^['"]|['"]$/g, ""), cwd))) return "ask";
  command = command.replace(/(?:^|\s)(?:>>?|<)\s*([^\s;|&]+)/g, " ");
  const argv = split(command); if (!argv?.length) return "ask";
  if (argv[0] === "cd") return argv.length === 2 && safePath(argv[1], cwd) ? "allow" : "ask";
  if (["ls", "cat", "head", "tail", "grep", "find", "wc", "pwd", "echo", "printf", "test", "[", "true", "which", "sort", "uniq", "cut", "tr", "jq"].includes(argv[0])) return pathsSafe(argv.slice(1), cwd) ? "allow" : "ask";
  if (argv[0] === "sed" && argv[1] === "-n") return pathsSafe(argv.slice(2), cwd) ? "allow" : "ask";
  if (argv[0] === "node" && argv[1] === "--check") return pathsSafe(argv.slice(2), cwd) ? "allow" : "ask";
  if (["mkdir", "cp", "mv", "rm", "tee"].includes(argv[0])) return writeTargets(argv, cwd) ? "allow" : "ask";
  if (argv[0] === "npm" && argv[1] === "ci") return "allow";
  if (argv[0] === "npm" && argv[1] === "run" && ["db:generate", "db:studio", "db:studio:cloud"].includes(argv[2])) return "allow";
  if (argv[0] === "npm" && argv[1] === "run" && argv[2] === "dev") return "ask";
  if (argv[0] === "npm" && argv[1] === "run" && argv[2] === "gtm" && argv[3] === "--") {
    const args = argv.slice(4), cmd = args[0];
    if (["check", "verify", "query", "diagram", "help"].includes(cmd)) return "allow";
    if (cmd === "runs" && args[1] === "get") return "allow";
    if (cmd === "run" && args.includes("--dry-run")) return "allow";
    return "ask";
  }
  if (["node", "npm"].includes(argv[0]) && argv[1] === "--version") return "allow";
  if (argv[0] === "git") {
    if (argv[1] === "add" && argv.includes("-f")) return "ask";
    if (["status", "diff", "log", "add", "commit", "fetch", "rev-parse", "show", "ls-files", "branch"].includes(argv[1])) return pathsSafe(argv.slice(2), cwd) ? "allow" : "ask";
    if (argv[1] === "remote" && argv[2] === "-v") return "allow";
    return "ask";
  }
  if (argv[0] === "vercel") return "ask";
  return "ask";
}

function stripHeredoc(command) {
  const newline = command.indexOf("\n"); if (newline < 0) return command;
  const header = command.slice(0, newline), marker = header.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/); if (!marker) return command;
  const rest = command.slice(newline + 1), end = new RegExp(`^${marker[1]}$`, "m").exec(rest); if (!end) return null;
  const tail = rest.slice(end.index + end[0].length).trim(); if (tail) return null;
  return header.replace(marker[0], " ").trim();
}

function splitChain(command) {
  const result = []; let value = "", quote = "";
  for (let i = 0; i < command.length; i++) { const char = command[i]; if (quote) { value += char; if (char === quote && command[i - 1] !== "\\") quote = ""; continue; } if (char === "'" || char === '"') { quote = char; value += char; continue; } if (char === "\n" || char === ";" || (char === "&" && command[i + 1] === "&") || (char === "|" && command[i + 1] === "|")) { if (value.trim()) result.push(value.trim()); value = ""; if (char === "&" || char === "|") i++; continue; } value += char; }
  if (quote) return null; if (value.trim()) result.push(value.trim()); return result;
}
function split(command) { const result = []; let value = "", quote = ""; for (const char of command.trim()) { if (quote) { if (char === quote) quote = ""; else value += char; } else if (char === "'" || char === '"') quote = char; else if (/\s/.test(char)) { if (value) { result.push(value); value = ""; } } else value += char; } if (quote) return null; if (value) result.push(value); return result; }
function roots(cwd) { return [resolve(cwd), resolve(home, ".gtm"), "/tmp/gtm-scratch"]; }
function safePath(value, cwd) { if (!value || value.startsWith("-") || /[*?{}]/.test(value)) return true; const path = resolve(cwd, value); if (/\/(?:\.env[^/]*|\.gitignore)$/.test(path)) return false; return roots(cwd).some((root) => relative(root, path) === "" || (!relative(root, path).startsWith("..") && !isAbsolute(relative(root, path)))); }
function pathsSafe(args, cwd) { return args.filter((value) => !value.startsWith("-") && !/^\d+$/.test(value) && !/^[\w.-]+=/.test(value)).every((value) => safePath(value, cwd)); }
function writeTargets(argv, cwd) { const operands = argv.slice(1).filter((value) => !value.startsWith("-")); if (!operands.length) return false; const targets = argv[0] === "cp" || argv[0] === "mv" ? [operands.at(-1)] : operands; return targets.every((value) => safePath(value, cwd)); }

async function installedScope(cwd) { const gtm = resolve(home, ".gtm"); const path = resolve(cwd); if (path === gtm || path.startsWith(`${gtm}/`)) return true; try { await access(join(path, "ORG.md"), constants.F_OK); return true; } catch { return false; } }
async function install() {
  const settingsPath = join(home, ".claude", "settings.json"); await mkdir(dirname(settingsPath), { recursive: true }); let settings = {}; try { settings = JSON.parse(await readFile(settingsPath, "utf8")); } catch {}
  const command = `node ${JSON.stringify(script)}`; const hooks = settings.hooks ?? {}; const entries = (hooks.PreToolUse ?? []).filter((entry) => !JSON.stringify(entry).includes(script));
  for (const matcher of ["Bash", "Write|Edit|MultiEdit"]) entries.push({ matcher, hooks: [{ type: "command", command }] });
  settings.hooks = { ...hooks, PreToolUse: entries }; await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`); process.stdout.write("Restart Claude Code to finish setup.\n");
}
async function hook() {
  const payload = JSON.parse((await readFile(0, "utf8")) || "{}"), cwd = payload.cwd ?? process.cwd(); if (!(await installedScope(cwd))) return;
  const tool = payload.tool_name ?? "Bash", input = payload.tool_input ?? {}; const decision = tool === "Bash" ? classify(input.command ?? "", cwd) : safePath(input.file_path ?? "", cwd) ? "allow" : "ask";
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: decision === "allow" ? "Allowed inside the GTM workspace." : "This action needs approval." } })}\n`);
}

if (process.argv[1] === script) { if (process.argv[2] === "--install-claude-code") await install(); else if (process.argv[2] === "--classify") process.stdout.write(`${JSON.stringify({ decision: classify(process.argv.slice(3).join(" ")) })}\n`); else await hook(); }
