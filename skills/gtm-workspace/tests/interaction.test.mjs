import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const skills = fileURLToPath(new URL('../../', import.meta.url));
for (const skill of readdirSync(skills)) {
  const file = resolve(skills, skill, 'references/interactions.md');
  if (!existsSync(file)) continue;
  test(`${skill} authored dialogue uses direct language while preserving human input`, () => {
    let agent = false;
    for (const [index, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      if (/^(?:\*\*)?Agent:/.test(line)) agent = true;
      else if (/^(?:\*\*)?(?:User|Human|Setup|Files):|^##/.test(line)) agent = false;
      if (agent) assert.doesNotMatch(line.replace(/`[^`]*`/g, ''), /\b(?:I|me|my|mine|you|your|yours|myself|yourself)\b/i, `${file}:${index + 1}`);
    }
  });
}
