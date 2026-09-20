#!/usr/bin/env node
// The runtime is on Postgres. This holds the rule and its allow-list in one place: the old database's names appear
// only where they still mean something. Keep the list short: reword a doc rather than add it here.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WORDS = /libsql|turso|sqlite/i;
const SEARCHED = ["skills/gtm-workflow", "skills/gtm-agent", "README.md", "docs"];
const SKIPPED_FOLDERS = ["node_modules", ".output", ".nitro", ".vercel", ".swc", "data"];
const SKIPPED = [
  /^skills\/gtm-workflow\/connections\//, // the component's own journal and lock stay on SQLite
  /(^|\/)package-lock\.json$/, // drizzle-orm's optional peers
  /^skills\/gtm-workflow\/scripts\/import-from-turso\.mjs$/,
  /^skills\/gtm-workflow\/tests\/import-from-turso\.test\.mjs$/,
];
// file → the lines that may carry a word; `section` allows a whole Markdown section instead.
const ALLOWED = {
  "skills/gtm-workflow/references/reliability.md": { section: "## Convert a SQLite workspace" },
  "skills/gtm-workflow/SKILL.md": { line: /reliability\.md#convert-a-sqlite-workspace/ },
  "skills/gtm-workflow/templates/lib/connections-contract.ts": { line: /^const reserved = / },
  "skills/gtm-agent/scripts/viewer-config.mjs": { line: /TURSO_(?:\||\s+while)/ },
  "skills/gtm-agent/scripts/doctor.mjs": { line: /TURSO_(?:\||\s+while)/ },
  "skills/gtm-workflow/scripts/upgrade-package.mjs": { line: /^const removed = / },
  "skills/gtm-workflow/tests/reliability.test.ts": { line: /@libsql\/client/ },
  "skills/gtm-workflow/tests/run.mjs": { line: /"import-from-turso"/ },
  "skills/gtm-workflow/tests/no-old-database-words.mjs": { line: /./ },
};

async function files(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];
  const found = [];
  for (const entry of entries) {
    if (entry.isDirectory() ? SKIPPED_FOLDERS.includes(entry.name) : false) continue;
    found.push(...(entry.isDirectory() ? await files(join(path, entry.name)) : [join(path, entry.name)]));
  }
  return found;
}

const problems = [];
for (const start of SEARCHED)
  for (const file of await files(join(root, start))) {
    const name = relative(root, file).replaceAll("\\", "/");
    if (SKIPPED.some((pattern) => pattern.test(name)) || /\.(png|jpe?g|gif|webp|ico|woff2?|pdf)$/i.test(name)) continue;
    const allowed = ALLOWED[name];
    let section = "";
    (await readFile(file, "utf8")).split(/\r?\n/).forEach((line, index) => {
      if (/^#{1,6} /.test(line)) section = line.trim();
      if (!WORDS.test(line)) return;
      if (allowed?.section ? section === allowed.section || line.trim() === allowed.section : allowed?.line?.test(line)) return;
      problems.push(`${name}:${index + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
if (problems.length) {
  console.error(`The old database is named outside the allowed places:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("No SQLite, libSQL or Turso wording outside the allowed places.");
