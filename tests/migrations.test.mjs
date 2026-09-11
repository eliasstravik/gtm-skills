import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '../skills/gtm-workflow/templates/node_modules/@libsql/client/lib-esm/node.js';

const directory = await mkdtemp(join(tmpdir(), 'gtm-migrations-'));
process.env.TURSO_DATABASE_URL = `file:${join(directory, 'one.db')}`;
delete process.env.GTM_SANDBOX;
const { ensureMigrated, insertRun, findLatestRun } = await import('../skills/gtm-workflow/templates/lib/db.ts');
const { migrations } = await import('../skills/gtm-workflow/templates/lib/migrations.generated.ts');
const templates = fileURLToPath(new URL('../skills/gtm-workflow/templates/', import.meta.url));
after(async () => { await rm(directory, { recursive: true, force: true }); });

test('a fresh database applies every migration once and a second call is a no-op', async () => {
  await ensureMigrated();
  await ensureMigrated();
  const client = createClient({ url: process.env.TURSO_DATABASE_URL });
  const rows = await client.execute('select count(*) as n from __drizzle_migrations');
  assert.equal(Number(rows.rows[0].n), migrations.length);
  client.close();
});

test('two processes migrating the same fresh database both succeed and apply each migration once', async () => {
  const url = `file:${join(directory, 'two.db')}`;
  const script = `import('${join(templates, 'lib/db.ts')}').then((m) => m.ensureMigrated()).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); })`;
  const child = () => new Promise((resolve) => {
    const proc = spawn(process.execPath, ['--import', join(templates, 'node_modules/tsx/dist/loader.mjs'), '-e', script], { env: { ...process.env, TURSO_DATABASE_URL: url }, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; proc.stderr.on('data', (d) => stderr += d);
    proc.on('close', (code) => resolve({ code, stderr }));
  });
  const results = await Promise.all([child(), child()]);
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  const client = createClient({ url });
  const rows = await client.execute('select count(*) as n from __drizzle_migrations');
  assert.equal(Number(rows.rows[0].n), migrations.length);
  client.close();
});

test('the latest run is found by workflow name and workspace head', async () => {
  const base = { path: 'score', method: 'POST', input: '{}', inputHash: 'x', status: 'completed', finishedAt: 5 };
  await insertRun({ ...base, runKey: 'k1', workflow: 'score', workspaceHead: 'aaa', startedAt: 1, inputHash: 'a' });
  await insertRun({ ...base, runKey: 'k2', workflow: 'score', workspaceHead: 'bbb', startedAt: 2, inputHash: 'b' });
  assert.equal((await findLatestRun('score', 'aaa'))?.runKey, 'k1');
  assert.equal((await findLatestRun('score'))?.runKey, 'k2');
  assert.equal(await findLatestRun('score', 'zzz'), undefined);
  assert.equal(await findLatestRun('other'), undefined);
});
