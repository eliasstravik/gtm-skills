// Every skill's SKILL.md frontmatter follows the skill format rules, so no skill loader
// skips it: a name of 1-64 lowercase letters, digits and single hyphens that matches its
// folder, and a non-empty description of at most 1,024 characters. Executor's loader
// skipped gtm-workflow whole while its description ran to 1,051 characters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
const NAME_MAX = 64;
const DESCRIPTION_MAX = 1024;

// The top-level scalar fields of the frontmatter; null when there is none.
// Reads plain, quoted and block (| or >) scalars, which is all a SKILL.md uses.
export function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return null;
  const fields = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const key = /^([A-Za-z][\w-]*):(?:[ \t]+(.*))?$/.exec(lines[i]);
    if (!key) continue;
    const more = [];
    while (i + 1 < lines.length && (/^[ \t]/.test(lines[i + 1]) || lines[i + 1].trim() === "")) more.push(lines[++i]);
    if (key[1] in fields) fields[`duplicate ${key[1]}`] = true;
    fields[key[1]] = scalar((key[2] ?? "").trim(), more);
  }
  return fields;
}

function scalar(value, more) {
  if (/^[|>]/.test(value)) {
    const body = more.map((line) => line.trim());
    while (body.length && body.at(-1) === "") body.pop();
    return body.join(value.startsWith("|") ? "\n" : " ");
  }
  if (value.startsWith('"')) {
    try { return JSON.parse(value); } catch { return value; }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) return value.slice(1, -1).replaceAll("''", "'");
  return [value, ...more.map((line) => line.trim())].filter(Boolean).join(" ");
}

// The rules a skill in folder `folder` with SKILL.md `text` breaks, one line each.
export function problems(folder, text) {
  const fields = frontmatter(text);
  if (!fields) return ["SKILL.md does not start with a --- frontmatter block"];
  const found = [];
  for (const key of ["name", "description"]) if (fields[`duplicate ${key}`]) found.push(`${key} appears twice`);
  const { name, description } = fields;
  if (typeof name !== "string" || name === "") found.push("name is missing");
  else {
    if ([...name].length > NAME_MAX) found.push(`name is ${[...name].length} characters, over ${NAME_MAX}`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) found.push(`name "${name}" must be lowercase letters, digits and single hyphens, not starting or ending with one`);
    if (/anthropic|claude/.test(name)) found.push(`name "${name}" uses a reserved word (anthropic, claude)`);
    if (name !== folder) found.push(`name "${name}" does not match its folder "${folder}"`);
  }
  if (typeof description !== "string" || description.trim() === "") found.push("description is missing or empty");
  else {
    const length = [...description].length;
    if (length > DESCRIPTION_MAX) found.push(`description is ${length} characters, over ${DESCRIPTION_MAX}`);
    if (/<\/?[A-Za-z][^>]*>/.test(description)) found.push("description contains an XML tag");
  }
  return found;
}

const skills = readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md")))
  .map((entry) => entry.name);

test("the repository has skills to check", () => {
  assert.ok(skills.length > 0, `no skills found in ${skillsDir}`);
});

for (const folder of skills) {
  test(`${folder}: SKILL.md name and description follow the skill format`, () => {
    assert.deepEqual(problems(folder, readFileSync(join(skillsDir, folder, "SKILL.md"), "utf8")), []);
  });
}

const skillMd = (name, description) => `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  version: "1.0.0"\n---\n\n# X\n`;

test("a description at the limit passes and one character over fails", () => {
  assert.deepEqual(problems("gtm-x", skillMd("gtm-x", "a".repeat(DESCRIPTION_MAX))), []);
  assert.deepEqual(problems("gtm-x", skillMd("gtm-x", "a".repeat(DESCRIPTION_MAX + 1))), [`description is ${DESCRIPTION_MAX + 1} characters, over ${DESCRIPTION_MAX}`]);
});

test("block, quoted and wrapped descriptions are measured as loaded", () => {
  const long = "word ".repeat(210).trim();
  const block = `---\nname: gtm-x\ndescription: >\n  ${long}\n---\n`;
  assert.match(problems("gtm-x", block).join(), /description is 1049 characters/);
  assert.deepEqual(problems("gtm-x", skillMd("gtm-x", '"Triggers when \\"x\\" happens."')), []);
  const wrapped = `---\nname: gtm-x\ndescription: ${"a".repeat(600)}\n  ${"b".repeat(600)}\n---\n`;
  assert.match(problems("gtm-x", wrapped).join(), /description is 1201 characters/);
});

test("invalid names and missing fields fail", () => {
  assert.deepEqual(problems("gtm-x", skillMd("gtm-x", "")), ["description is missing or empty"]);
  assert.deepEqual(problems("gtm-x", "# no frontmatter\n"), ["SKILL.md does not start with a --- frontmatter block"]);
  assert.deepEqual(problems("gtm-x", "---\ndescription: Does x.\n---\n"), ["name is missing"]);
  for (const bad of ["GTM-X", "gtm_x", "-gtm-x", "gtm-x-", "gtm--x", "gtm x"]) {
    assert.ok(problems(bad, skillMd(bad, "Does x.")).some((line) => line.includes("lowercase letters")), bad);
  }
  assert.match(problems("x".repeat(65), skillMd("x".repeat(65), "Does x.")).join(), /name is 65 characters, over 64/);
  assert.match(problems("claude-x", skillMd("claude-x", "Does x.")).join(), /reserved word/);
  assert.deepEqual(problems("gtm-y", skillMd("gtm-x", "Does x.")), ['name "gtm-x" does not match its folder "gtm-y"']);
  assert.deepEqual(problems("gtm-x", skillMd("gtm-x", "Use <b>this</b>.")), ["description contains an XML tag"]);
});
