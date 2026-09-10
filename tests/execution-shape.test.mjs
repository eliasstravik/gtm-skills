import assert from 'node:assert/strict';
import test from 'node:test';
import { executionShape } from '../skills/gtm-workflow/templates/lib/execution.ts';
import { extractGraph } from '../skills/gtm-workflow/templates/lib/diagram.ts';
import { rowsWorkflow, parentWorkflow } from './fixtures/batch-workflows.mjs';

test('preview and diagram preserve declared width and child shape', () => {
  assert.equal(executionShape(rowsWorkflow).concurrency, 4);
  assert.match(extractGraph(rowsWorkflow, 'parallel-proof').graph.groups[0].label, /4 rows at a time/);
  assert.deepEqual(executionShape(parentWorkflow()).batch, { childWorkflow: 'parallel-proof', batchSize: 4, timeoutMs: 120000, table: 'accounts' });
  assert.equal(extractGraph(parentWorkflow(), 'batch-proof').graph.nodes.find(node => node.childWorkflow).childWorkflow, 'parallel-proof');
});
test('constant concurrency has the same checks as a literal', () => {
  const source = rowsWorkflow.replace('concurrency: 4', 'concurrency: WIDTH') + '\nconst WIDTH = 4;';
  assert.equal(executionShape(source).concurrency, 4);
  assert.match(extractGraph(source, 'parallel-proof').graph.groups[0].label, /4 rows at a time/);
});
test('checker rejects width drift, dynamic limits, and retried row steps', () => {
  for (const width of ['17', '0', '1.5', 'arg.width']) assert.throws(() => executionShape(rowsWorkflow.replace('concurrency: 4', `concurrency: ${width}`)));
  assert.throws(() => executionShape(rowsWorkflow.replace('Concurrency: 4', 'Concurrency: 1')), /header/);
  assert.throws(() => executionShape(rowsWorkflow.replace('lookupAccount.maxRetries = 0;', '')), /maxRetries/);
});
test('checker rejects nested batch lifecycles, dynamic starts, and mismatched table declarations', () => {
  for (const source of [
    parentWorkflow().replace('batchSize: 4', 'batchSize: 301'),
    parentWorkflow().replace('"use workflow"', '"use step"'),
    parentWorkflow().replace('childWorkflow: "parallel-proof"', 'childWorkflow: arg.path'),
    parentWorkflow().replace('table: "accounts"', 'table: "other"'),
    parentWorkflow().replace('return runBatches', 'await sleep("1s"); return runBatches'),
  ]) assert.throws(() => executionShape(source));
});
