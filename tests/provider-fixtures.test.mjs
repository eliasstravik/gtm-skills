import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../skills/gtm-workflow/templates/', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'gtm-fixture-mode-'));
after(() => rm(directory, { recursive: true, force: true }));
const provider = new URL('../skills/gtm-workflow/templates/lib/provider.ts', import.meta.url).href;
const db = new URL('../skills/gtm-workflow/templates/lib/db.ts', import.meta.url).href;
const zod = new URL('../skills/gtm-workflow/templates/node_modules/zod/index.js', import.meta.url).href;
const workflow = join(directory, 'workflow.mjs');
const fixture = join(directory, 'rows.json');
await mkdir(join(directory, 'providers/__fixtures__/company'), { recursive: true });
await writeFile(join(directory, 'providers/__fixtures__/company/lookup.json'), JSON.stringify([
  { input: { key: 'one' }, value: { score: 7 } }, { input: { key: 'held' }, error: 'auth' },
]));
const run = () => spawnSync(process.execPath, ['--experimental-permission', '--allow-fs-read=*', '--allow-worker', '--import', join(root, 'node_modules/tsx/dist/loader.mjs'), join(root, 'lib/fixture-worker.ts'), workflow, fixture, '["score"]'], {
  cwd: directory, encoding: 'utf8', timeout: 15000,
  env: { PATH: process.env.PATH, GTM_AGENT_BACKEND: 'api', GTM_PROVIDER_MODE: 'fixture', NODE_NO_WARNINGS: '1', TSX_DISABLE_CACHE: '1' },
});
const rowCode = `import { provider } from ${JSON.stringify(provider)}; import { z } from ${JSON.stringify(zod)};
export async function score(row, meta) { const result = await provider({ name: 'company', endpoint: 'lookup', input: row, meta,
  schema: z.object({ score: z.number() }), ttlMs: 10, costUsd: 3, call: () => { throw new Error('Live call attempted'); } });
  return { score: result.value.score, cost: result.costUsd }; }`;
test('row fixtures run the actual exported step with no live calls or database', async () => {
  await writeFile(workflow, rowCode);
  await writeFile(fixture, JSON.stringify([{ step: 'score', row: { key: 'one' }, expected: { score: 7, cost: 0 } }]));
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { checked: 1, warnings: [] });
});
test('missing adapter fixtures warn with the exact path and never fall back', async () => {
  await writeFile(fixture, JSON.stringify([{ step: 'score', row: { key: 'missing' }, expected: {} }]));
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).warnings[0], /SHOULD FIX:.*providers\/__fixtures__\/company\/lookup.json/);
});
test('output mismatch and auth holds fail fixture verification', async () => {
  for (const row of [{ key: 'one' }, { key: 'held' }]) {
    await writeFile(fixture, JSON.stringify([{ step: 'score', row, expected: {} }]));
    const result = run(); assert.equal(result.status, 1); assert.match(result.stderr, /differs|authentication/);
  }
});
test('the worker denies network, file writes, process spawning and database access', async () => {
  await writeFile(fixture, JSON.stringify([{ step: 'score', row: {}, expected: {} }]));
  for (const body of [
    'await fetch("https://example.invalid")',
    'await (await import("node:fs/promises")).writeFile("forbidden", "data")',
    '(await import("node:child_process")).spawnSync("echo", ["forbidden"])',
    'new (await import("node:worker_threads")).Worker("", { eval: true })',
    `await (await import(${JSON.stringify(db)})).getDb()`,
  ]) {
    await writeFile(workflow, `export async function score() { ${body}; return {}; }`);
    const result = run(); assert.equal(result.status, 1, body); assert.match(result.stderr, /cannot|restricted/);
  }
});
