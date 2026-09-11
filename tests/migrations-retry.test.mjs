import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'gtm-migrate-retry-'));
// An unreachable remote database makes the first attempt fail at connection time.
process.env.TURSO_DATABASE_URL = 'https://127.0.0.1:9/';
process.env.TURSO_AUTH_TOKEN = 'x';
delete process.env.GTM_SANDBOX;
const { ensureMigrated, getMigrationStatus } = await import('../skills/gtm-workflow/templates/lib/db.ts');
after(async () => { await rm(directory, { recursive: true, force: true }); });

test('a failed startup migration is retried on the next request instead of being cached forever', async () => {
  await assert.rejects(ensureMigrated());
  assert.match(getMigrationStatus(), /^failed/);
  process.env.TURSO_DATABASE_URL = `file:${join(directory, 'retry.db')}`;
  delete process.env.TURSO_AUTH_TOKEN;
  await ensureMigrated();
  assert.equal(getMigrationStatus(), 'ok');
});
