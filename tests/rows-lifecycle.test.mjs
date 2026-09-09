import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
const order = [];
let terminal;
mock.module('../skills/gtm-workflow/templates/lib/approve.ts', { namedExports: {
  cancellationHook: { create: () => Object.assign(new Promise(() => {}), { dispose: async () => {} }) },
  cancellationToken: () => 'fixture', checkpoint: async () => ({ approved: true }),
} });
mock.module('../skills/gtm-workflow/templates/lib/steps.ts', { namedExports: {
  getActualRunCostUsd: async () => 0,
  getHeldRunReason: async () => null,
  registerWorkflowRun: async () => {},
  updateRun: async (_key, patch) => { terminal = patch; order.push('finish'); },
} });
// Resolve through the template's installed dependency, as the actual row helper does.
mock.module('../skills/gtm-workflow/templates/node_modules/workflow/dist/index.js', { namedExports: { setAttributes: async () => {} } });
const { runRows } = await import('../skills/gtm-workflow/templates/lib/rows.ts');
const input = () => ({ rows: [{ key: 'one' }], meta: { runKey: 'fixture', slug: 'fixture', checkpoint: null }, caps: { maxRows: 1, maxSpendUsd: 1, costPerRowUsd: 0 }, table: { name: 'fixture', save: async () => { order.push('save'); } }, rowStep: async row => ({ key: row.key, value: {} }) });
test('afterSave runs after persistence and before terminal bookkeeping', async () => {
  order.length = 0; terminal = undefined;
  const result = await runRows({ ...input(), afterSave: async (_row, meta, signal) => {
    assert.equal(terminal, undefined); assert.equal(meta.rowKey, 'one'); assert.equal(signal.aborted, false); order.push('send');
  } });
  assert.deepEqual(order, ['save', 'send', 'finish']); assert.equal(result.status, 'completed');
});
test('delivery failure produces a failed run and never counts the row as successful', async () => {
  const result = await runRows({ ...input(), afterSave: async () => { throw new Error('delivery failed'); } });
  assert.equal(result.status, 'failed'); assert.equal(result.counts.success, 0); assert.equal(terminal.status, 'failed'); assert.equal(terminal.finished, true);
});
test('save failure never attempts delivery', async () => {
  let sent = false;
  const result = await runRows({ ...input(), table: { name: 'fixture', save: async () => { throw new Error('save failed'); } }, afterSave: async () => { sent = true; } });
  assert.equal(sent, false); assert.equal(result.status, 'failed');
});
