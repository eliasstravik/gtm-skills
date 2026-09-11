import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';
const order = [];
let terminal;
let cancelRun, spent = 0, checkpointState, held = null;
const attributes = [];
beforeEach(() => { order.length = 0; attributes.length = 0; terminal = undefined; spent = 0; checkpointState = undefined; held = null; });
mock.module('../skills/gtm-workflow/templates/lib/approve.ts', { namedExports: {
  cancellationHook: { create: () => Object.assign(new Promise(resolve => { cancelRun = () => resolve({ reason: 'fixture cancelled' }); }), { dispose: async () => {} }) },
  cancellationToken: () => 'fixture', checkpoint: async (_meta, state) => { checkpointState = state; order.push('checkpoint'); return { approved: false }; },
} });
mock.module('../skills/gtm-workflow/templates/lib/steps.ts', { namedExports: {
  getActualRunCostUsd: async () => spent,
  getHeldRunReason: async () => held,
  registerWorkflowRun: async () => {},
  recordCompletedRow: async () => {},
  updateRun: async (_key, patch) => { if (patch.status) { terminal = patch; order.push('finish'); } },
} });
// Resolve through the template's installed dependency, as the actual row helper does.
mock.module('../skills/gtm-workflow/templates/node_modules/workflow/dist/index.js', { namedExports: { setAttributes: async value => { attributes.push(value); } } });
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

const parallelInput = (count = 6) => ({ ...input(), rows: Array.from({ length: count }, (_, index) => ({ key: String(index) })), concurrency: 4, caps: { maxRows: count, maxSpendUsd: 1, costPerRowUsd: 0.1 } });
test('out-of-order rows stay bounded, isolated, and saved before delivery', async () => {
  let active = 0, peak = 0;
  const saved = [];
  const result = await runRows({ ...parallelInput(), rowStep: async (row, meta) => {
    active++; peak = Math.max(peak, active); assert.equal(meta.concurrency, 4);
    await new Promise(resolve => setTimeout(resolve, (4 - Number(row.key) % 4) * 5)); active--;
    if (row.key === '1') throw new Error('one isolated failure');
    return { key: row.key, value: {} };
  }, table: { name: 'fixture', save: async row => { saved.push(row.key); } }, afterSave: async row => {
    assert.ok(saved.includes(row.key)); order.push(`delivered:${row.key}`);
  } });
  assert.equal(peak, 4); assert.equal(active, 0);
  assert.deepEqual(result.completed, ['0', '2', '3', '4', '5']);
  assert.deepEqual(result.failed.map(row => row.key), ['1']);
  assert.notDeepEqual(saved, result.completed); assert.equal(order.filter(item => item.startsWith('delivered:')).length, 5);
  assert.ok(attributes.every(value => !('row' in value))); assert.equal(terminal.finished, true);
});
test('checkpoint rounds up to a batch boundary after all saves and deliveries', async () => {
  const result = await runRows({ ...parallelInput(), meta: { ...input().meta, checkpoint: 2 }, afterSave: async row => { order.push(`delivered:${row.key}`); } });
  assert.equal(checkpointState.completed, 4); assert.equal(checkpointState.concurrency, 4);
  assert.equal(order.indexOf('checkpoint'), 8); assert.deepEqual(result.remainingKeys, ['4', '5']);
});
test('ledger exhaustion stops the next batch after all current siblings finish', async () => {
  const result = await runRows({ ...parallelInput(), rowStep: async row => { spent += 0.25; return { key: row.key, value: {} }; } });
  assert.equal(result.stopReason, 'spend_cap'); assert.equal(result.completed.length, 4); assert.deepEqual(result.remainingKeys, ['4', '5']);
});
test('an unadmitted row remains resumable when the SDK wraps the budget error', async () => {
  const result = await runRows({ ...parallelInput(), rowStep: async row => {
    if (row.key === '1') throw new Error('Step "lookup" failed after 0 retries: [spend_cap] Call exceeds the remaining accepted budget');
    return { key: row.key, value: {} };
  } });
  assert.equal(result.stopReason, 'spend_cap'); assert.equal(result.failed.length, 0);
  assert.deepEqual(result.remainingKeys, ['1', '4', '5']); assert.equal(result.completed.length, 3);
});
test('provider hold settles siblings and leaves later rows untouched', async () => {
  const result = await runRows({ ...parallelInput(), rowStep: async row => {
    if (row.key === '1') throw Object.assign(new Error('denied'), { providerErrorKind: 'provider_auth' });
    return { key: row.key, value: {} };
  } });
  assert.equal(result.stopReason, 'provider_auth'); assert.equal(result.completed.length, 3); assert.deepEqual(result.remainingKeys, ['4', '5']);
});
test('cancellation interrupts the whole active batch and prevents saving or delivery', async () => {
  let calls = 0, signals = [];
  const result = await runRows({ ...parallelInput(), rowStep: async (_row, _meta, signal) => {
    calls++; signals.push(signal); if (calls === 4) cancelRun(); return new Promise(() => {});
  }, afterSave: async () => { throw new Error('must not deliver'); } });
  assert.equal(result.status, 'cancelling'); assert.equal(calls, 4); assert.ok(signals.every(signal => signal.aborted));
  assert.deepEqual(result.remainingKeys, ['0', '1', '2', '3', '4', '5']); assert.deepEqual(order, ['finish']); assert.equal(terminal.finished, false);
});
test('caps and concurrency reject before any row work', async () => {
  let calls = 0;
  for (const concurrency of [0, 17, 1.5, NaN]) await assert.rejects(runRows({ ...parallelInput(), concurrency, rowStep: async () => { calls++; } }), /concurrency/);
  await assert.rejects(runRows({ ...parallelInput(), caps: { maxRows: 2, maxSpendUsd: 1, costPerRowUsd: 0 }, rowStep: async () => { calls++; } }), /limits/);
  assert.equal(calls, 0);
});
test('a failed row leaves its plain reason on the run so runs get can show it', async () => {
  const result = await runRows({ ...input(), rowStep: async () => { throw new Error('Add an AI key to .env, or set GTM_HOST.'); } });
  assert.equal(result.status, 'failed');
  assert.match(String(terminal.error), /Add an AI key to \.env, or set GTM_HOST\./);
  assert.equal(terminal.failed_step, 'rowStep');
});
test('the runtime retry wrapper is stripped so the run shows the plain reason', async () => {
  const result = await runRows({ ...input(), rowStep: async () => { throw new Error('Step "step//./workflows/score//scoreCompany" failed after 3 retries: Add an AI key to .env, or set GTM_HOST.'); } });
  assert.equal(result.status, 'failed');
  assert.equal(terminal.error, 'Add an AI key to .env, or set GTM_HOST.');
});
