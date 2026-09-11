import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classify } from '../skills/gtm-workflow/scripts/command-permission.mjs';

const corpus = JSON.parse(readFileSync(new URL('../evals/gtm-workflow/fixtures/commands.json', import.meta.url), 'utf8'));
const cwd = await realpath(await mkdtemp(join(tmpdir(), 'gtm-classify-')));
await mkdir(join(cwd, 'workflows'), { recursive: true });
await mkdir(join(cwd, 'data'), { recursive: true });
await writeFile(join(cwd, '.env.example'), 'X=\n');

for (const entry of corpus) {
  test(`${JSON.stringify(entry.command)} is ${entry.expected}`, () => {
    assert.equal(classify(entry.command, cwd), entry.expected);
  });
}

test('the corpus covers at least fifty commands', () => {
  assert.ok(corpus.length >= 50, `only ${corpus.length} commands`);
});

test.after(async () => { await rm(cwd, { recursive: true, force: true }); });
