import assert from 'node:assert/strict';
import test from 'node:test';
import { preflightWorkflow } from '../skills/gtm-workflow/templates/lib/preflight.ts';
const files = {
  'workflows/accounts.ts': '/**\n * Result table: target_accounts | key: domain\n */\nimport { lookup } from "../providers/company";',
  'providers/company.ts': '/**\n * Provider: company\n * Environment: COMPANY_KEY COMPANY_REGION\n * Auth check: GET https://company.example.test/account free\n * Auth header: Authorization | COMPANY_KEY | Bearer\n */',
};
const base = { readSource: async (name) => files[name] ?? null, tableExists: async (name) => name === 'target_accounts', environment: { COMPANY_KEY: 'fixture-secret', COMPANY_REGION: 'eu' } };
test('preflight only calls the declared free check and never returns credentials', async () => {
  let calls = 0;
  const result = await preflightWorkflow('accounts', { ...base, request: async (url, options) => {
    calls++; assert.equal(String(url), 'https://company.example.test/account');
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer fixture-secret'); return new Response('{}');
  } });
  assert.equal(calls, 1); assert.equal(result.ok, true);
  assert.deepEqual(result.auth, [{ provider: 'company', status: 'verified' }]);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
});
test('missing credential and table fail without contacting a provider', async () => {
  const result = await preflightWorkflow('accounts', { ...base, environment: {}, tableExists: async () => false,
    request: async () => { throw new Error('must not call'); } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['Environment COMPANY_KEY', 'Environment COMPANY_REGION', 'Table target_accounts']);
});
test('auth failures, timeouts, and non-free declarations cannot report verified', async () => {
  for (const request of [async () => new Response('fixture-secret', { status: 401 }), async () => { throw new Error('fixture-secret'); }]) {
    const result = await preflightWorkflow('accounts', { ...base, request });
    assert.equal(result.ok, false); assert.deepEqual(result.missing, ['Authentication for company']);
    assert.doesNotMatch(JSON.stringify(result), /fixture-secret/);
  }
  const result = await preflightWorkflow('accounts', { ...base, readSource: async (name) => files[name]?.replace('account free', 'account') ?? null,
    request: async () => { assert.fail('unreviewed endpoint'); } });
  assert.equal(result.ok, false);
});
test('providers without free checks are disclosed and imported child adapters are checked', async () => {
  const sources = { ...files, 'providers/company.ts': '/**\n * Provider: company\n * Auth check: none\n */\nexport { lookup } from "./nested";',
    'providers/nested.ts': '/**\n * Provider: nested\n * Environment: NESTED_KEY\n * Auth check: none\n */' };
  const result = await preflightWorkflow('accounts', { ...base, readSource: async (name) => sources[name] ?? null });
  assert.equal(result.ok, false); assert.deepEqual(result.missing, ['Environment NESTED_KEY']);
  assert.deepEqual(result.auth.map((entry) => entry.status), ['unavailable', 'unavailable']);
});
