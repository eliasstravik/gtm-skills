import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP, backgroundArgv, pendingFrom } from '../skills/gtm-workflow/templates/lib/cli-helpers.ts';

test('pending migrations are the files whose hash is not in the ledger', () => {
  const files = [{ file: 'drizzle/0000_a.sql', hash: 'h1' }, { file: 'drizzle/0001_b.sql', hash: 'h2' }];
  assert.deepEqual(pendingFrom(files, new Set(['h1'])), ['drizzle/0001_b.sql']);
  assert.deepEqual(pendingFrom(files, new Set(['h1', 'h2'])), []);
});

test('background argv drops the flag and keeps every other argument in order', () => {
  assert.deepEqual(
    backgroundArgv(['run', 'score', '--input', 'data/t.json', '--background', '--url', 'https://h', '--wait-live']),
    ['run', 'score', '--input', 'data/t.json', '--url', 'https://h', '--wait-live'],
  );
});

test('help lists every flag and diagram format', () => {
  for (const item of ['--dry-run', '--wait-live', '--background', '--checkpoint', '--url', '--wait', '--format', '--yes', '--sql', 'json', 'svg', 'png', 'web', 'markdown', 'csv', 'upgrade', 'help']) {
    assert.ok(HELP.includes(item), `help should mention ${item}`);
  }
});
