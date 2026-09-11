import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureRunSecret } from '../skills/gtm-workflow/templates/lib/local-env.ts';

async function scratch() { return mkdtemp(join(tmpdir(), 'gtm-local-env-')); }

test('generates a run secret into .env when the value is empty', async () => {
  const root = await scratch();
  await writeFile(join(root, '.env'), 'GTM_RUN_SECRET=\nFOO=bar\n');
  const env = {};
  const secret = await ensureRunSecret(root, env);
  assert.match(secret, /^[0-9a-f]{64}$/);
  assert.equal(env.GTM_RUN_SECRET, secret);
  const file = await readFile(join(root, '.env'), 'utf8');
  assert.match(file, new RegExp(`^GTM_RUN_SECRET=${secret}$`, 'm'));
  assert.match(file, /^FOO=bar$/m);
  await rm(root, { recursive: true, force: true });
});

test('keeps an existing secret and leaves .env untouched', async () => {
  const root = await scratch();
  await writeFile(join(root, '.env'), 'GTM_RUN_SECRET=existing\n');
  const env = { GTM_RUN_SECRET: 'existing' };
  assert.equal(await ensureRunSecret(root, env), 'existing');
  assert.equal(await readFile(join(root, '.env'), 'utf8'), 'GTM_RUN_SECRET=existing\n');
  await rm(root, { recursive: true, force: true });
});

test('creates .env when it is missing', async () => {
  const root = await scratch();
  const env = {};
  const secret = await ensureRunSecret(root, env);
  assert.match(await readFile(join(root, '.env'), 'utf8'), new RegExp(`GTM_RUN_SECRET=${secret}`));
  await rm(root, { recursive: true, force: true });
});

test('never writes a secret inside the hosted sandbox', async () => {
  const root = await scratch();
  const env = { GTM_SANDBOX: '1' };
  assert.equal(await ensureRunSecret(root, env), undefined);
  await assert.rejects(readFile(join(root, '.env'), 'utf8'));
  await rm(root, { recursive: true, force: true });
});
