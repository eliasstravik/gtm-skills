import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let response, attempts = 0, settlement;
mock.module('../skills/gtm-workflow/templates/node_modules/@ai-sdk/mcp/dist/index.js', { namedExports: {
  createMCPClient: async () => ({ callTool: async () => { attempts++; return response; }, close: async () => {} }),
} });
mock.module('../skills/gtm-workflow/templates/lib/agent-ledger.ts', { namedExports: {
  reserveAgentCall: async () => 'attempt', settleAgentCall: async (...args) => { settlement = args; },
} });
const { executeAgentTool } = await import('../skills/gtm-workflow/templates/lib/agent-tools.ts');
const { toolDefinition } = await import('../skills/gtm-workflow/templates/lib/capabilities.ts');
const noMatchSchema = { type: 'object', properties: {
  provider: { const: 'hunterio' }, status: { const: 'COMPLETED' },
  providerResponse: { type: 'object', properties: { httpStatus: { const: 404 } }, required: ['httpStatus'] },
}, required: ['provider', 'status', 'providerResponse'] };
const spec = { name: 'lookup', description: 'Lookup a profile', inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
  effect: 'read', costUsd: 0.05, costKind: 'estimate', maxCalls: 4, timeoutMs: 1000, maxOutputBytes: 5000,
  transport: { kind: 'mcp', url: 'https://mcp.example.test/v1', tool: 'lookup' }, fixedArguments: {} };
const payload = { provider: 'hunterio', status: 'COMPLETED', providerResponse: { httpStatus: 404, error: { details: 'Email not found' } } };
const call = (definition = spec) => executeAgentTool(definition, {}, { runKey: 'fixture', slug: 'fixture' }, 'one', 1, 4);
test('a committed no-match response reaches the agent without retrying', async () => {
  attempts = 0; response = { isError: true, structuredContent: payload, content: [{ type: 'text', text: JSON.stringify(payload) }] };
  const result = await call({ ...spec, recoverableErrorSchema: noMatchSchema });
  assert.deepEqual(result, response); assert.equal(attempts, 1); assert.equal(settlement[2], true);
});
test('text-only MCP JSON can carry the same committed no-match response', async () => {
  response = { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] };
  assert.deepEqual(await call({ ...spec, recoverableErrorSchema: noMatchSchema }), response);
});
test('unknown, auth, and quota errors fail with redacted details and one attempt', async () => {
  process.env.FIXTURE_API_KEY = 'fixture-credential-value';
  for (const status of [401, 403, 429, 500]) {
    attempts = 0;
    response = { isError: true, structuredContent: { ...payload, providerResponse: { httpStatus: status } },
      content: [{ type: 'text', text: `HTTP ${status}: fixture-credential-value Bearer hidden-value` }] };
    await assert.rejects(call({ ...spec, recoverableErrorSchema: noMatchSchema }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`)); assert.doesNotMatch(error.message, /fixture-credential-value|hidden-value/); return true;
    });
    assert.equal(attempts, 1); assert.equal(settlement[2], true); assert.match(settlement[3], new RegExp(`HTTP ${status}`));
  }
  delete process.env.FIXTURE_API_KEY;
});
test('recovery is opt-in and never available to writes', async () => {
  response = { isError: true, structuredContent: payload, content: [] };
  await assert.rejects(call(), /MCP tool reported an error/);
  assert.equal(toolDefinition.safeParse({ ...spec, effect: 'write', recoverableErrorSchema: noMatchSchema }).success, false);
});

test('the captured opaque Monid error can be explicitly returned as unavailable, with a failed ledger attempt', async () => {
  response = { content: [{ type: 'text', text: '{"error":"Request failed"}' }], structuredContent: { error: 'Request failed' }, isError: true };
  const exactError = { type: 'object', properties: { error: { const: 'Request failed' } }, required: ['error'], additionalProperties: false };
  assert.deepEqual(await call({ ...spec, recoverableErrorSchema: exactError }), response);
  assert.equal(settlement[2], true); assert.match(settlement[3], /Request failed/);
});
