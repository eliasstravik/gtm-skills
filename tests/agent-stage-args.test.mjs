import assert from 'node:assert/strict';
import test from 'node:test';
import { canRunStage, claudeStageArgs, mcpConfig } from '../skills/gtm-workflow/templates/lib/agent.ts';

test('claude can run agentic stages locally and codex cannot', () => {
  assert.equal(canRunStage('claude'), true);
  assert.equal(canRunStage('codex'), false);
  assert.equal(canRunStage('gateway'), true);
});

test('claude stage arguments cap the budget and allow only MCP tools', () => {
  const args = claudeStageArgs({ prompt: 'Research the company', schemaJson: { type: 'object' }, maxUsd: 0.5, mcpConfigFile: '/tmp/mcp.json' });
  const after = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(after('--max-budget-usd'), '0.5');
  assert.equal(after('--mcp-config'), '/tmp/mcp.json');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(after('--tools'), '');
  assert.equal(after('--allowedTools'), 'mcp__*');
  assert.equal(after('--output-format'), 'json');
  assert.ok(args.includes('--json-schema'));
  assert.equal(after('-p'), 'Research the company');
});

test('mcp config resolves header values from environment names', () => {
  const config = mcpConfig(
    [{ name: 'company', url: 'https://x.example/mcp', headers: { Authorization: 'COMPANY_TOKEN' } }],
    { COMPANY_TOKEN: 'Bearer abc' },
  );
  assert.deepEqual(config, { mcpServers: { company: { type: 'http', url: 'https://x.example/mcp', headers: { Authorization: 'Bearer abc' } } } });
  assert.throws(() => mcpConfig([{ name: 'c', url: 'https://c/mcp', headers: { A: 'MISSING_NAME' } }], {}), /Configure MISSING_NAME/);
});
