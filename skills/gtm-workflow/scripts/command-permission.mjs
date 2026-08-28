#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const direct = process.argv[2] === "--classify" ? process.argv.slice(3).join(" ") : null;
const payload = direct === null ? JSON.parse((await readFile(0, "utf8")) || "{}") : null;
const command = direct ?? payload?.tool_input?.command ?? "";
const decision = classify(command);

if (direct !== null) {
  process.stdout.write(`${JSON.stringify({ decision })}\n`);
} else {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason:
          decision === "allow"
            ? "The command is a read-only GTM workflow inspection or dry run."
            : "The command may spend, mutate, deploy, or could not be classified safely.",
      },
    })}\n`,
  );
}

export function classify(command) {
  if (!command.trim() || /[$`;\\&<>|\r\n]/.test(command)) return "ask";
  const argv = split(command);
  if (!argv) return "ask";

  if (starts(argv, ["npm", "run", "gtm", "--"])) {
    const args = argv.slice(4);
    if (args[0] === "check" || args[0] === "query") return "allow";
    if (args[0] === "runs" && args[1] === "get") return "allow";
    if (args[0] === "run" && args.includes("--dry-run")) return "allow";
    return "ask";
  }
  if (
    starts(argv, ["npm", "run", "db:generate"]) ||
    starts(argv, ["npm", "run", "db:studio"]) ||
    starts(argv, ["npm", "run", "db:studio:cloud"]) ||
    starts(argv, ["npm", "run", "db:verify"])
  ) {
    return "allow";
  }
  if (
    starts(argv, ["npx", "workflow", "inspect"]) ||
    starts(argv, ["npx", "workflow", "validate"])
  ) {
    return "allow";
  }
  return "ask";
}

function starts(argv, prefix) {
  return prefix.every((value, index) => argv[index] === value);
}

function split(command) {
  const argv = [];
  let value = "";
  let quote = null;
  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = null;
      else value += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (value) {
        argv.push(value);
        value = "";
      }
      continue;
    }
    value += character;
  }
  if (quote) return null;
  if (value) argv.push(value);
  return argv;
}
