import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { table, rowsWorkflow, parentWorkflow, agentWorkflow, isolationWorkflow, expiryWorkflow, modelPreload } from './fixtures/batch-workflows.mjs';

// Deterministic SDK/local-world integration. No external model, provider, or skill evaluation.
test('parallel rows, child batches, and early agent completion through the local world', { timeout: 300000 }, async t => {
  const templates = resolve(import.meta.dirname, '../skills/gtm-workflow/templates');
  const directory = process.env.GTM_RUNTIME_FIXTURE_DIR ?? await mkdtemp(join(tmpdir(), 'gtm-batch-runtime-'));
  await mkdir(directory, { recursive: true });
  t.diagnostic(`Fixture artifacts: ${directory}`);
  await cp(templates, directory, { recursive: true, filter: file => !['node_modules', '.output', '.nitro', '.vercel', '.swc', 'data'].includes(relative(templates, file).split('/')[0]) });
  for (const path of ['workflows', 'db/tables']) await mkdir(join(directory, path), { recursive: true });
  for (const [path, source] of Object.entries({
    'db/tables/accounts.ts': table, 'workflows/parallel-proof.ts': rowsWorkflow,
    'workflows/batch-proof.ts': parentWorkflow(), 'workflows/deadline-parent.ts': parentWorkflow('deadlineParent', 1500),
    'workflows/budget-parent.ts': parentWorkflow('budgetParent', 120000, 0.10),
    'workflows/deadline-proof.ts': agentWorkflow, 'fixture-preload.mjs': modelPreload,
    'workflows/deadline-isolation.ts': isolationWorkflow, 'workflows/deadline-expiry.ts': expiryWorkflow,
  })) await writeFile(join(directory, path), source);
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:${process.env.PATH}`,
    GTM_RUN_SECRET: 'fixture-secret', GTM_BASE_URL: origin, WORKFLOW_LOCAL_BASE_URL: origin,
    TURSO_DATABASE_URL: 'file:./data/fixture.db', WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: '0',
    WORKFLOW_EMBEDDED_DATA_DIR: 'node_modules/.nitro/workflow', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40),
    AI_GATEWAY_API_KEY: 'fixture-only', WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS: '360000', WORKFLOW_LOCAL_BODY_TIMEOUT_MS: '360000' };
  for (const key of ['TURSO_AUTH_TOKEN', 'TURSO_READ_ONLY_AUTH_TOKEN', 'VERCEL_OIDC_TOKEN', 'NODE_OPTIONS']) delete env[key];
  await mkdir(join(directory, 'data'), { recursive: true });
  const command = async (args, limit = 120000) => {
    const child = spawn(args[0], args.slice(1), { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), limit);
    const code = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); }); clearTimeout(timer);
    assert.equal(code, 0, `${args.join(' ')}\n${output.slice(-14000)}`); return output;
  };
  const lastJson = output => JSON.parse(output.trim().split('\n').at(-1));
  const cli = async args => lastJson(await command([process.execPath, '--import', 'tsx', 'scripts/gtm.ts', ...args]));
  await command(['npm', 'ci']);
  await command(['npm', 'run', 'db:migrate']);
  await command(['npm', 'run', 'db:generate', '--', '--name', 'fixture_accounts']);
  await command(['npm', 'run', 'db:migrate']);
  const check = await cli(['check']); assert.equal(check.ok, true); assert.equal(check.libVersion, 21);
  await command(['npm', 'run', 'build']);
  const server = spawn(join(directory, 'node_modules/.bin/nitro'), ['dev', '--port', String(port)], {
    cwd: directory, env: { ...env, NODE_OPTIONS: `--import=${join(directory, 'fixture-preload.mjs')}` }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let logs = ''; server.stdout.on('data', data => { logs += data; }); server.stderr.on('data', data => { logs += data; });
  t.after(async () => {
    await writeFile(join(directory, 'server.log'), logs);
    if (process.env.GTM_KEEP_FIXTURE_SERVER !== '1') { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
    server.stdout.destroy(); server.stderr.destroy(); server.unref();
  });
  const until = async (fn, timeout = 45000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 250)); }
    throw new Error(`Timed out waiting for fixture\n${logs.slice(-10000)}`);
  };
  await until(async () => { try { return (await fetch(origin + '/api/deployment', { headers: { authorization: 'Bearer fixture-secret' } })).ok; } catch { return false; } });
  const start = async (workflow, rows) => {
    const file = `${workflow}-input.json`; await writeFile(join(directory, file), JSON.stringify({ rows }));
    return cli(['run', workflow, '--input', file]);
  };
  const get = async key => {
    const response = await fetch(`${origin}/api/runs/${key}`, { headers: { authorization: 'Bearer fixture-secret' } });
    assert.equal(response.status, 200); return response.json();
  };
  const done = key => until(async () => { const value = await get(key); return ['completed', 'failed', 'stopped', 'timed_out', 'cancelled'].includes(value.status) && value.finishedAt ? value : false; });
  const inputRows = prefix => Array.from({ length: 8 }, (_, index) => ({ key: `${prefix}-${index}` }));
  const parallel = await start('parallel-proof', inputRows('parallel'));
  const parallelResult = await done(parallel.runKey); assert.equal(parallelResult.completed, 8); assert.equal(parallelResult.status, 'completed');
  const dryRun = await cli(['run', 'parallel-proof', '--input', 'parallel-proof-input.json', '--dry-run']); assert.equal(dryRun.concurrency, 4);
  const parent = await start('batch-proof', inputRows('batch'));
  const parentResult = await done(parent.runKey);
  assert.equal(parentResult.status, 'completed'); assert.equal(parentResult.completed, 8); assert.equal(parentResult.children.length, 2);
  assert.ok(parentResult.children.every(child => child.parentRunKey === parent.runKey && child.completed === 4));
  assert.ok(Math.abs(parentResult.costUsd - 0.08) < 1e-8);
  const graph = await cli(['diagram', 'batch-proof', '--run', parent.runKey, '--format', 'json']);
  const batchNode = graph.nodes.find(node => node.childWorkflow); assert.equal(batchNode.batches.length, 2); assert.ok(batchNode.childSvg.includes('<svg'));
  const rowGraph = await cli(['diagram', 'parallel-proof', '--run', parallel.runKey, '--format', 'json']); assert.match(rowGraph.groups[0].label, /4 rows at a time/);
  for (const [slug, run] of [['parallel-proof', parallel], ['batch-proof', parent]]) {
    await writeFile(join(directory, `${slug}-receipt.md`), await command([process.execPath, '--import', 'tsx', 'scripts/gtm.ts', 'runs', 'get', run.runKey, '--format', 'markdown']));
    await command([process.execPath, '--import', 'tsx', 'scripts/gtm.ts', 'diagram', slug, '--run', run.runKey, '--format', 'svg', '--output', `${slug}.svg`]);
  }
  const failureRows = inputRows('failure'); failureRows[1].fail = true;
  const failure = await done((await start('batch-proof', failureRows)).runKey);
  assert.equal(failure.failed, 1); assert.equal(failure.completed, 7); assert.equal(failure.children.length, 2); assert.equal(failure.children[1].status, 'completed');
  const rerun = await cli(['run', 'batch-proof', '--rows-from-run', failure.runKey, '--only', 'failed', '--dry-run']);
  assert.equal(rerun.rows, 1);
  const budgetRows = inputRows('budget').map(row => ({ ...row, cost: 0.03 }));
  const budget = await done((await start('budget-parent', budgetRows)).runKey);
  assert.equal(budget.children.length, 1); assert.ok(budget.costUsd <= 0.10); assert.equal(budget.stopReason, 'spend_cap');
  assert.equal(budget.completed, 3); assert.equal(budget.remaining_keys.length, 5);
  const heldRows = inputRows('hold'); heldRows[0].hold = true;
  const held = await done((await start('batch-proof', heldRows)).runKey); assert.equal(held.children.length, 1); assert.equal(held.stopReason, 'provider_auth');
  const cancel = await start('batch-proof', inputRows('cancel').map(row => ({ ...row, slow: true })));
  await until(async () => (await get(cancel.runKey)).children.length > 0);
  const cancellation = await fetch(`${origin}/api/runs/${cancel.runKey}/cancel`, { method: 'POST', headers: { authorization: 'Bearer fixture-secret' } }); assert.equal(cancellation.status, 200);
  const cancelled = await done(cancel.runKey); assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.children.length, 1); assert.equal(cancelled.children[0].status, 'cancelled');
  assert.deepEqual(cancelled.remaining_keys, inputRows('cancel').map(row => row.key));
  const expired = await done((await start('deadline-parent', inputRows('deadline').map(row => ({ ...row, slow: true })))).runKey);
  assert.equal(expired.status, 'timed_out'); assert.equal(expired.children.length, 1);
  const before = Date.now();
  const agent = await done((await start('deadline-proof', [{ key: 'instant-agent' }])).runKey);
  assert.equal(agent.status, 'completed'); assert.ok(Date.now() - before < 30000, 'ten-minute timer must not hold completion');
  const isolationStart = Date.now();
  const isolation = await done((await start('deadline-isolation', [{ key: 'parallel-agent-1' }, { key: 'parallel-agent-2' }])).runKey);
  assert.equal(isolation.status, 'completed'); assert.equal(isolation.completed, 2); assert.ok(Date.now() - isolationStart >= 2000, 'agent cleanup must not wake sibling delays');
  const expiry = await done((await start('deadline-expiry', [{ key: 'slow-model' }])).runKey);
  assert.equal(expiry.status, 'failed'); assert.equal(expiry.failed, 1);
  const events = lastJson(await command([process.execPath, '--import', 'tsx', '--input-type=module', '-e', `
    import { getWorld } from 'workflow/runtime';
    const world = await getWorld(); const all = []; let cursor;
    do { const page = await world.events.list({ runId: ${JSON.stringify(agent.runId)}, pagination: { sortOrder: 'asc', cursor }, resolveData: 'none' }); all.push(...page.data); cursor = page.hasMore ? page.cursor : undefined; } while (cursor);
    const completed = new Set(all.filter(event => event.eventType === 'wait_completed').map(event => event.correlationId));
    const timers = (await world.runs.list({ workflowName: 'workflow//./lib/agent-deadline//agentDeadline', pagination: { limit: 100 }, resolveData: 'none' })).data;
    const timerProof = [];
    for (const timer of timers) {
      const events = (await world.events.list({ runId: timer.runId, pagination: { limit: 100 }, resolveData: 'none' })).data;
      const ended = new Set(events.filter(event => event.eventType === 'wait_completed').map(event => event.correlationId));
      timerProof.push({ status: timer.status, pending: events.filter(event => event.eventType === 'wait_created' && !ended.has(event.correlationId)).length });
    }
    console.log(JSON.stringify({ types: all.map(event => event.eventType), pending: all.filter(event => event.eventType === 'wait_created' && !completed.has(event.correlationId)), timers: timerProof }));
  `]));
  await writeFile(join(directory, 'deadline-events.json'), JSON.stringify(events, null, 2));
  assert.equal(events.pending.length, 0, 'finished agent must leave no pending durable sleep');
  assert.equal(events.timers.length, 4); assert.ok(events.timers.every(timer => timer.status === 'completed' && timer.pending === 0));
  await writeFile(join(directory, 'proof.json'), JSON.stringify({ origin, parallel: parallelResult, parent: parentResult, agent, events }, null, 2));
});
