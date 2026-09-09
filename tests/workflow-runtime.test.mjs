import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeWorkflowCode } from '../skills/gtm-workflow/templates/scripts/check-workflow-runtime.mjs';

test('compiled startup rejects Node requires even though JavaScript compilation succeeds', async () => {
  await assert.rejects(initializeWorkflowCode('require("node:crypto")'), /require is not defined/);
});
test('workflow registration succeeds without executing a registered step', async () => {
  const count = await initializeWorkflowCode(`
    globalThis.__private_workflows = new Map();
    const step = globalThis[Symbol.for('WORKFLOW_USE_STEP')]('test');
    __private_workflows.set('test', async () => step());
  `);
  assert.equal(count, 1);
});
test('initialization cannot execute a step or read deployment credentials', async () => {
  await assert.rejects(initializeWorkflowCode(`globalThis[Symbol.for('WORKFLOW_USE_STEP')]('test')()`), /cannot execute step/);
  process.env.GTM_RUNTIME_CHECK_SECRET = 'fixture-secret';
  try {
    await initializeWorkflowCode('if (process.env.GTM_RUNTIME_CHECK_SECRET !== undefined) throw new Error("credential leaked")');
  } finally { delete process.env.GTM_RUNTIME_CHECK_SECRET; }
});
