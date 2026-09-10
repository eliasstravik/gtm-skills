import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '../skills/gtm-workflow/templates/node_modules/@libsql/client/lib-esm/node.js';
import { z } from '../skills/gtm-workflow/templates/node_modules/zod/index.js';
const directory = await mkdtemp(join(tmpdir(), 'gtm-model-cache-'));
process.env.TURSO_DATABASE_URL = `file:${join(directory, 'cache.db')}`;
process.env.GTM_AGENT_BACKEND = 'api';
process.env.AI_GATEWAY_API_KEY = 'fixture-only';
delete process.env.GTM_AGENT_MODEL; delete process.env.GTM_WORKFLOW_MODEL;
const calls = [];
mock.module('../skills/gtm-workflow/templates/node_modules/ai/dist/index.js', { namedExports: {
  generateText: async (input) => { calls.push(input); return { output: { score: calls.length }, response: { messages: [] }, providerMetadata: { gateway: { cost: 0.01 } } }; },
  gateway: { tools: { exaSearch: () => ({}) } }, jsonSchema: (schema) => schema,
  Output: { object: (schema) => schema }, stepCountIs: (n) => n,
} });
const client = createClient({ url: process.env.TURSO_DATABASE_URL });
const migrations = new URL('../skills/gtm-workflow/templates/drizzle/', import.meta.url);
for (const file of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
  for (const sql of (await readFile(new URL(file, migrations), 'utf8')).split('--> statement-breakpoint')) if (sql.trim()) await client.execute(sql);
}
const { agent, DEFAULT_WORKFLOW_MODEL } = await import('../skills/gtm-workflow/templates/lib/agent.ts');
const input = { prompt: 'Score the fixture account', schema: z.object({ score: z.number() }), meta: { runKey: 'fixture', slug: 'fixture' }, maxUsd: 0.1 };
after(async () => { client.close(); await rm(directory, { recursive: true, force: true }); });

test('default, per-call and environment models use separate real cache entries', async () => {
  const first = await agent(input);
  assert.deepEqual(await agent(input), first);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_WORKFLOW_MODEL);
  assert.equal(calls[0].reasoning, 'high');
  process.env.GTM_AGENT_MODEL = 'fixture/legacy';
  await agent(input);
  assert.equal(calls.at(-1).model, 'fixture/legacy');
  process.env.GTM_WORKFLOW_MODEL = 'fixture/environment';
  await agent(input);
  assert.equal(calls.at(-1).model, 'fixture/environment');
  await agent({ ...input, model: 'fixture/override', reasoning: 'low' });
  assert.equal(calls.at(-1).model, 'fixture/override');
  assert.equal(calls.at(-1).reasoning, 'low');
  await agent({ ...input, model: 'fixture/override', reasoning: 'high' });
  assert.equal(calls.length, 5, 'reasoning change must miss the cache too');
  const cached = await client.execute("select endpoint from enrichment_runs where status = 'cache_hit'");
  assert.equal(cached.rows.length, 1);
  assert.equal(cached.rows[0].endpoint, `api/${DEFAULT_WORKFLOW_MODEL}`);
});
test('web research and structured answer both receive the chosen model and reasoning', async () => {
  const before = calls.length;
  await agent({ ...input, tools: 'web', model: 'fixture/web', reasoning: 'high' });
  assert.equal(calls.length, before + 2);
  for (const call of calls.slice(before)) { assert.equal(call.model, 'fixture/web'); assert.equal(call.reasoning, 'high'); }
  assert.ok(calls[before].tools);
  assert.equal(calls[before + 1].tools, undefined);
});
