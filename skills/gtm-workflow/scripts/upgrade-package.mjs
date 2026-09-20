#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Only recognized template commands are replaced. All other commands need a human-readable review.
const stock = {
  viewer: /^node scripts\/start-viewer\.mjs$/,
  dev: /^(?:node scripts\/build-viewer\.mjs && )?drizzle-kit migrate && (?:node scripts\/profile-migrate\.mjs && )?(?:node scripts\/viewer-migrate\.mjs && )?(?:WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS=900000 WORKFLOW_LOCAL_BODY_TIMEOUT_MS=900000 )?nitro dev --port 3939$/,
  build:
    /^(?:node scripts\/build-viewer\.mjs && )?drizzle-kit migrate && (?:node scripts\/profile-migrate\.mjs && )?(?:node scripts\/viewer-migrate\.mjs && )?nitro build$/,
  "db:studio": /^drizzle-kit studio$/,
};

export function mergePackage(current, template) {
  const scripts = { ...current.scripts };
  const review = [];
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
