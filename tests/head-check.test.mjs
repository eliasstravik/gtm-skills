import assert from 'node:assert/strict';
import test from 'node:test';
import { headCheck } from '../skills/gtm-workflow/templates/lib/head-check.ts';

test('a local server ignores the workspace head header', () => {
  assert.equal(headCheck({ method: 'POST', expectedHead: 'abc', deployedHead: undefined }), null);
});
test('production requires the header on a start', () => {
  assert.equal(headCheck({ method: 'POST', expectedHead: null, deployedHead: 'abc' })?.code, 'deployment_head_required');
});
test('production refuses a start for a different commit', () => {
  assert.equal(headCheck({ method: 'POST', expectedHead: 'def', deployedHead: 'abc' })?.code, 'deployment_not_ready');
});
test('production accepts the matching commit', () => {
  assert.equal(headCheck({ method: 'POST', expectedHead: 'abc', deployedHead: 'abc' }), null);
});
test('scheduled GET starts never check the header', () => {
  assert.equal(headCheck({ method: 'GET', expectedHead: null, deployedHead: 'abc' }), null);
});
