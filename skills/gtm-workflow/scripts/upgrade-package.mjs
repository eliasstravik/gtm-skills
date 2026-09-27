#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Only recognized template commands are replaced. All other commands need a human-readable review.
// Add a pattern here when a template command changes, so workspaces still on the old stock command are updated.
const stock = { dev: /^node scripts\/local-launch\.mjs dev$/ };
// Stock commands the template dropped; a customized one stays and is listed for review.
const retired = { viewer: /^node scripts\/local-launch\.mjs viewer$/ };

/** -1, 0 or 1 for two x.y.z versions; anything unparsable counts as 0.0.0. */
export function compareVersions(a, b) {
  const parts = (v) => (/^\d+\.\d+\.\d+/.test(v ?? "") ? v.split(".").slice(0, 3).map((n) => parseInt(n, 10)) : [0, 0, 0]);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

export function mergePackage(current, template) {
  // An older skill copy (a Slack agent on an older pin, say) must never take a newer workspace back.
  if (compareVersions(template.version, current.version) < 0)
    throw new Error(
      `The installed template is ${template.version} and this workspace is on ${current.version}: update the skills before upgrading, never downgrade`,
    );
  const scripts = { ...current.scripts };
  const review = [];
  for (const [name, pattern] of Object.entries(retired)) if (pattern.test(scripts[name] ?? "")) delete scripts[name];
  for (const [name, command] of Object.entries(template.scripts)) {
    if (scripts[name] === undefined || stock[name]?.test(scripts[name]))
      scripts[name] = command;
    else if (scripts[name] !== command) review.push(name);
  }
  return {
    package: {
      ...current,
      version: template.version,
      scripts,
      dependencies: { ...current.dependencies, ...template.dependencies },
      devDependencies: {
        ...current.devDependencies,
        ...template.devDependencies,
      },
    },
    review,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (!args[0] || args.some((x, i) => i > 0 && x !== "--write"))
    throw new Error(
      "Usage: node upgrade-package.mjs /path/to/workflows [--write]",
    );
  const target = resolve(args[0]);
  if (existsSync(resolve(target, "scripts/gtm.ts")))
    throw new Error(
      "Previous runtime: this upgrade does not convert scripts/gtm.ts workspaces",
    );
  const template = JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../templates/package.json",
      ),
      "utf8",
    ),
  );
  const result = mergePackage(
    JSON.parse(readFileSync(resolve(target, "package.json"), "utf8")),
    template,
  );
  if (args.includes("--write"))
    writeFileSync(
      resolve(target, "package.json"),
      JSON.stringify(result.package, null, 2) + "\n",
    );
  console.log(JSON.stringify(result, null, 2));
}
