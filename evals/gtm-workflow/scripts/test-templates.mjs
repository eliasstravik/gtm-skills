import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const repo = resolve(import.meta.dirname, "../../..");
const templates = join(repo, "skills/gtm-workflow/templates");

test("v8 templates pass the local, approval, scheduled, webhook, cancel, and sandbox paths", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "gtm-workflow-v8-"));
  let vendor;
  let server;
  context.after(async () => {
    if (server) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
      server.stdout.destroy();
      server.stderr.destroy();
      server.unref();
    }
    if (vendor) await new Promise((resolvePromise) => vendor.close(resolvePromise));
    await rm(directory, { recursive: true, force: true });
  });
  await cp(templates, directory, {
    recursive: true,
    filter(source) {
      const name = relative(templates, source).split("/")[0];
      return !["node_modules", ".output", ".swc", "data", ".gitignore"].includes(name);
    },
  });
  await rename(join(directory, "gitignore"), join(directory, ".gitignore"));
  await rename(join(directory, "vercelignore"), join(directory, ".vercelignore"));
  await mkdir(join(directory, "workflows"), { recursive: true });
  await mkdir(join(directory, "db/tables"), { recursive: true });
  await writeFile(join(directory, "db/tables/accounts.ts"), accountsTable);
  await writeFile(join(directory, "workflows/local-proof.ts"), localWorkflow);
  await writeFile(join(directory, "workflows/approval-proof.ts"), approvalWorkflow);
  await writeFile(join(directory, "workflows/scheduled-proof.ts"), scheduledWorkflow);
  await writeFile(join(directory, "workflows/webhook-proof.ts"), webhookWorkflow);
  await writeFile(join(directory, "vercel.json"), JSON.stringify({ crons: [{ path: "/api/run/scheduled-proof", schedule: "0 9 * * *" }] }));

  const fakeDirectory = join(directory, "fake-bin");
  const fakeCount = join(directory, "fake-claude-count");
  await mkdir(fakeDirectory);
  const fakeClaude = join(fakeDirectory, "claude");
  await writeFile(
    fakeClaude,
    `#!/bin/sh\nprintf x >> "${fakeCount}"\nprintf '%s\\n' '{"structured_output":{"score":91,"reason":"fixture"},"total_cost_usd":0.01}'\n`,
  );
  await chmod(fakeClaude, 0o755);

  let vendorCalls = 0;
  vendor = createServer((request, response) => {
    vendorCalls += 1;
    const url = new URL(request.url, "http://127.0.0.1");
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        company: url.searchParams.get("domain"),
        providerRecordId: `vendor-${vendorCalls}`,
      }),
    );
  });
  await new Promise((resolvePromise) => vendor.listen(0, "127.0.0.1", resolvePromise));
  const vendorPort = vendor.address().port;
  const nitroPort = await freePort();
  const secret = "fixture-run-secret";
  const deploymentHead = "a".repeat(40);
  const env = {
    ...process.env,
    PATH: `${fakeDirectory}:${process.env.PATH}`,
    GTM_AGENT_BACKEND: "claude",
    GTM_RUN_SECRET: secret,
    VERCEL_GIT_COMMIT_SHA: deploymentHead,
    MOCK_VENDOR_URL: `http://127.0.0.1:${vendorPort}`,
    GTM_BASE_URL: `http://127.0.0.1:${nitroPort}`,
    WORKFLOW_LOCAL_BASE_URL: `http://127.0.0.1:${nitroPort}`,
  };
  await writeFile(
    join(directory, ".env"),
    [
      `GTM_RUN_SECRET=${secret}`,
      "GTM_AGENT_BACKEND=claude",
      `MOCK_VENDOR_URL=http://127.0.0.1:${vendorPort}`,
    ].join("\n"),
  );

  await command("npm", ["ci"], { cwd: directory, env });
  await command("npm", ["run", "db:migrate"], { cwd: directory, env });
  await command("npm", ["run", "db:generate"], { cwd: directory, env });
  await command("npm", ["run", "db:migrate"], { cwd: directory, env });
  const check = await command("npm", ["run", "gtm", "--", "check"], { cwd: directory, env });
  assert.deepEqual(JSON.parse(lastJsonLine(check.stdout)), { ok: true, workflows: 4, libVersion: 8 });
  await writeFile(join(directory, "drizzle/9999_orphan.sql"), "SELECT 1;\n");
  const orphanMigration = await gtmFailure(directory, env, ["check"]);
  assert.equal(orphanMigration.error.code, "invalid_migration_artifacts");
  await rm(join(directory, "drizzle/9999_orphan.sql"));

  const localWorkflowPath = join(directory, "workflows/local-proof.ts");
  const validLocalWorkflow = await readFile(localWorkflowPath, "utf8");
  await writeFile(localWorkflowPath, validLocalWorkflow.replace("  arg = input.parse(arg);\n", ""));
  const missingInputParse = await gtmFailure(directory, env, ["check"]);
  assert.equal(missingInputParse.error.code, "invalid_input_parse");
  await writeFile(localWorkflowPath, validLocalWorkflow);
  const scheduledNoInput = await gtmFailure(directory, env, ["run", "scheduled-proof"]);
  assert.equal(scheduledNoInput.error.code, "invalid_input");
  assert.match(scheduledNoInput.error.message, /write scheduledInput to a file/);

  server = spawn(join(directory, "node_modules/.bin/nitro"), ["dev", "--port", String(nitroPort)], {
    cwd: directory,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let serverLog = "";
  server.stdout.on("data", (chunk) => (serverLog += chunk));
  server.stderr.on("data", (chunk) => (serverLog += chunk));
  await waitForOrigin(env.GTM_BASE_URL, () => serverLog);

  const unauthenticatedDeployment = await fetch(`${env.GTM_BASE_URL}/api/deployment`);
  assert.equal(unauthenticatedDeployment.status, 401);
  const deployment = await fetch(`${env.GTM_BASE_URL}/api/deployment`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(deployment.status, 200);
  assert.deepEqual(await deployment.json(), { head: deploymentHead });
  const mismatchedStart = await fetch(`${env.GTM_BASE_URL}/api/run/local-proof`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
      "x-gtm-workspace-head": "b".repeat(40),
    },
    body: "{}",
  });
  assert.equal(mismatchedStart.status, 409);
  assert.equal((await mismatchedStart.json()).error.code, "deployment_not_ready");

  const input = { rows: Array.from({ length: 20 }, (_, index) => ({ key: `account-${index}`, domain: `account-${index}.test` })) };
  const inputFile = join(directory, "data/input.json");
  await mkdir(dirname(inputFile), { recursive: true });
  await writeFile(inputFile, JSON.stringify(input));

  const dry = await gtm(directory, env, ["run", "local-proof", "--input", inputFile, "--dry-run"]);
  assert.equal(dry.rows, 20);
  assert.equal(dry.projectedCostUsd, 2);
  assert.equal(dry.withinCaps, true);
  assert.equal(await ledgerCount(directory, env), 0);

  const paused = await gtm(directory, env, [
    "run",
    "local-proof",
    "--input",
    inputFile,
    "--checkpoint",
    "3",
    "--wait",
  ]);
  assert.equal(paused.status, "waiting");
  assert.equal(paused.completed, 3);
  assert.equal((await tableRows(directory, env, "accounts")).length, 3);
  const duplicate = await gtmFailure(directory, env, ["run", "local-proof", "--input", inputFile]);
  assert.equal(duplicate.error.code, "run_in_progress");

  const token = paused.approval.token;
  const completed = await gtm(directory, env, ["approve", token, "--yes", "--wait"]);
  assert.equal(completed.status, "completed");
  assert.equal(completed.completed, 20);
  assert.equal((await tableRows(directory, env, "accounts")).length, 20);
  assert.equal(vendorCalls, 20);
  assert.equal((await readFile(fakeCount, "utf8")).length, 20);
  const cached = await sqlRows(
    directory,
    env,
    "select value, raw from enrichment_cache where provider = 'mock-data' order by inputs_hash limit 1",
  );
  assert.deepEqual(Object.keys(JSON.parse(cached[0].value)), ["company"]);
  assert.equal(typeof JSON.parse(cached[0].raw).providerRecordId, "string");
  const expandedCacheHit = await providerProbe(directory, env, {
    runKey: "expanded-schema",
    schema: "expanded",
  });
  assert.equal(expandedCacheHit.status, "cache_hit");
  assert.equal(expandedCacheHit.value.providerRecordId, "vendor-1");
  assert.equal(vendorCalls, 20);
  const legacyCacheHit = await providerProbe(directory, env, {
    runKey: "legacy-fallback",
    schema: "legacy",
  });
  assert.equal(legacyCacheHit.status, "cache_hit");
  assert.deepEqual(legacyCacheHit.value, { company: "legacy.test" });
  assert.equal(vendorCalls, 20);
  const writeQuery = await gtmFailure(directory, env, [
    "query",
    "--sql",
    "WITH selected AS (SELECT key FROM accounts) DELETE FROM accounts WHERE key IN (SELECT key FROM selected)",
  ]);
  assert.equal(writeQuery.error.code, "internal_error");
  assert.equal((await tableRows(directory, env, "accounts")).length, 20);

  const rerun = await gtm(directory, env, ["run", "local-proof", "--input", inputFile, "--wait"]);
  assert.equal(rerun.status, "completed");
  assert.equal(vendorCalls, 20);
  assert.equal((await readFile(fakeCount, "utf8")).length, 20);
  const secondLedger = await sqlRows(
    directory,
    env,
    `select status, cost_usd from enrichment_runs where run_key = '${rerun.runKey}'`,
  );
  assert.equal(secondLedger.length, 40);
  assert.ok(secondLedger.every((row) => row.status === "cache_hit" && row.cost_usd === 0));

  const denied = await startAndWait(directory, env, "approval-proof", { case: "deny" });
  const hooks = await command("npx", ["workflow", "inspect", "hooks", "--runId", denied.runId], { cwd: directory, env });
  assert.match(hooks.stdout, /hookId/);
  const deniedDone = await gtm(directory, env, ["approve", denied.approval.token, "--no", "--wait"]);
  assert.equal(deniedDone.status, "completed");
  assert.equal(deniedDone.approval.approved, false);
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 0);

  const accepted = await startAndWait(directory, env, "approval-proof", { case: "approve" });
  const acceptedDone = await gtm(directory, env, ["approve", accepted.approval.token, "--yes", "--wait"]);
  assert.equal(acceptedDone.status, "completed", JSON.stringify(acceptedDone));
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 1);
  const toCancel = await startAndWait(directory, env, "approval-proof", { case: "cancel" });
  assert.equal(toCancel.status, "waiting");
  const unauthenticatedCancel = await fetch(`${env.GTM_BASE_URL}/api/runs/${toCancel.runKey}/cancel`, { method: "POST" });
  assert.equal(unauthenticatedCancel.status, 401);
  const cancelled = await gtm(directory, env, ["cancel", toCancel.runKey, "--reason", "operator stopped it"]);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.runKey, toCancel.runKey);
  assert.notEqual(cancelled.finishedAt, null);
  assert.match(cancelled.error, /operator stopped it/);
  const cancelledAgain = await gtmFailure(directory, env, ["cancel", toCancel.runKey]);
  assert.equal(cancelledAgain.error.code, "run_not_active");
  const approveAfterCancel = await gtmFailure(directory, env, ["approve", toCancel.approval.token, "--yes"]);
  assert.equal(approveAfterCancel.error.code, "not_found");
  assert.equal((await gtm(directory, env, ["runs", "get", toCancel.runKey])).status, "cancelled");
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 1);
  const timed = await startAndWait(directory, env, "approval-proof", { case: "timeout", timeoutMs: 100 });
  const timedDone = await waitForRun(directory, env, timed.runKey, "completed");
  assert.equal(timedDone.approval.approved, false);
  assert.equal(timedDone.approval.comment, "timeout");

  const scheduledStart = await httpJson(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const scheduledWait = await waitForRun(directory, env, scheduledStart.runKey, "waiting");
  assert.equal(scheduledWait.method, "GET");
  const scheduledDuplicate = await httpJson(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, {
    headers: { authorization: `Bearer ${secret}` },
  }, 409);
  assert.equal(scheduledDuplicate.error.code, "run_in_progress");
  const scheduledInput = join(directory, "data/scheduled.json");
  await writeFile(scheduledInput, JSON.stringify({ date: "manual" }));
  const checkpointRefusal = await gtmFailure(directory, env, [
    "run",
    "scheduled-proof",
    "--input",
    scheduledInput,
    "--checkpoint",
    "1",
  ]);
  assert.equal(checkpointRefusal.error.code, "invalid_checkpoint");
  await gtm(directory, env, ["approve", scheduledWait.approval.token, "--no", "--wait"]);

  const concurrent = await Promise.all([
    fetch(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, { headers: { authorization: `Bearer ${secret}` } }),
    fetch(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, { headers: { authorization: `Bearer ${secret}` } }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const concurrentBodies = await Promise.all(concurrent.map((response) => response.json()));
  const concurrentStart = concurrentBodies.find((body) => body.runKey && !body.error);
  const concurrentWait = await waitForRun(directory, env, concurrentStart.runKey, "waiting");
  await gtm(directory, env, ["approve", concurrentWait.approval.token, "--no", "--wait"]);

  const webhook = await startAndWait(directory, env, "webhook-proof", { event: "fixture" });
  const webhookUrl = new URL(webhook.webhook_url);
  assert.equal(webhookUrl.port, String(nitroPort));
  assert.match(webhookUrl.pathname, /^\/\.well-known\/workflow\/v1\/webhook\//);
  await waitForHook(directory, env, webhook.runId);
  if (Number(process.versions.node.split(".")[0]) < 24) {
    const webhookResponse = await fetch(webhook.webhook_url, { method: "POST", body: JSON.stringify({ ok: true }) });
    assert.equal(webhookResponse.status, 202, serverLog);
    const webhookDone = await waitForRun(directory, env, webhook.runKey, "completed");
    assert.equal(webhookDone.status, "completed");
  } else {
    context.diagnostic("Webhook resume is deferred on Node 24; the scaffold pins Node 22 for this SDK release.");
  }

  const sandboxFile = await commandFailure(
    process.execPath,
    ["--import", "tsx", "-e", "import('./lib/db-url.ts').then(m => m.getDatabaseConfig())"],
    { cwd: directory, env: { ...env, GTM_SANDBOX: "1", TURSO_DATABASE_URL: "" } },
  );
  assert.match(sandboxFile.stderr, /requires TURSO_DATABASE_URL/);
  const sandboxBackend = await commandFailure(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      "import('./lib/agent.ts').then(async m => { const { z } = await import('zod'); await m.agent({ prompt: 'x', schema: z.object({ score: z.number() }), meta: { runKey: 'x', slug: 'x' } }) })",
    ],
    { cwd: directory, env: { ...env, GTM_SANDBOX: "1", GTM_AGENT_BACKEND: "claude" } },
  );
  assert.match(sandboxBackend.stderr, /requires GTM_AGENT_BACKEND=api/);
});

async function gtm(directory, env, args) {
  const result = await command("npm", ["run", "gtm", "--", ...args], { cwd: directory, env });
  return JSON.parse(lastJsonLine(result.stdout));
}

async function gtmFailure(directory, env, args) {
  const result = await commandFailure("npm", ["run", "gtm", "--", ...args], { cwd: directory, env });
  return JSON.parse(lastJsonLine(result.stderr));
}

async function startAndWait(directory, env, slug, input) {
  const file = join(directory, `data/${slug}-${Date.now()}.json`);
  await writeFile(file, JSON.stringify(input));
  return gtm(directory, env, ["run", slug, "--input", file, "--wait"]);
}

async function waitForRun(directory, env, runKey, status) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const row = await gtm(directory, env, ["runs", "get", runKey]);
    if (row.status === status) return row;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`run ${runKey} did not reach ${status}`);
}

async function waitForHook(directory, env, runId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await command("npx", ["workflow", "inspect", "hooks", "--runId", runId], { cwd: directory, env });
    if (/hookId/.test(result.stdout)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`run ${runId} did not register its webhook hook`);
}

async function ledgerCount(directory, env) {
  const rows = await sqlRows(directory, env, "select count(*) as count from enrichment_runs");
  return Number(rows[0].count);
}

async function tableRows(directory, env, table) {
  return sqlRows(directory, env, `select * from ${table}`);
}

async function sqlRows(directory, env, sql) {
  return gtm(directory, env, ["query", "--sql", sql, "--format", "json"]);
}

async function providerProbe(directory, env, options) {
  const script = `
    const [{ provider }, { getDb }, { enrichmentCache }, { z }] = await Promise.all([
      import("./lib/provider.ts"),
      import("./lib/db.ts"),
      import("./lib/schema.ts"),
      import("zod"),
    ]);
    if (${JSON.stringify(options.schema)} === "legacy") {
      const now = Date.now();
      await (await getDb()).insert(enrichmentCache).values({
        provider: "mock-data",
        endpoint: "organization-lookup-v1",
        inputsHash: "634f69893e1dc602fd23f311f27a4ac8d42ccc21059b47876d5b51d85117d1a3",
        inputs: JSON.stringify({ domain: "legacy.test" }),
        raw: null,
        value: JSON.stringify({ company: "legacy.test" }),
        expiresAt: now + 86_400_000,
        createdAt: now,
      });
    }
    const schema = ${JSON.stringify(options.schema)} === "expanded"
      ? z.object({ company: z.string(), providerRecordId: z.string() })
      : z.object({ company: z.string() });
    const domain = ${JSON.stringify(options.schema)} === "expanded" ? "account-0.test" : "legacy.test";
    const result = await provider({
      name: "mock-data",
      endpoint: "organization-lookup-v1",
      input: { domain },
      schema,
      ttlMs: 86_400_000,
      call: async () => { throw new Error("cache miss"); },
      meta: { runKey: ${JSON.stringify(options.runKey)}, slug: "provider-probe" },
    });
    process.stdout.write(JSON.stringify(result));
  `;
  const result = await command(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: directory,
    env,
  });
  return JSON.parse(result.stdout);
}

async function httpJson(url, init = {}, expectedStatus = 200) {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.text();
  assert.equal(response.status, expectedStatus, body);
  return JSON.parse(body);
}

async function waitForOrigin(origin, log) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(origin);
      return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Nitro did not start:\n${log()}`);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

function command(executable, args, options) {
  return runCommand(executable, args, options, false);
}

function commandFailure(executable, args, options) {
  return runCommand(executable, args, options, true);
}

function runCommand(executable, args, options, expectFailure) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if ((code === 0) === expectFailure) {
        reject(new Error(`${executable} ${args.join(" ")} exited ${code}\n${stdout}\n${stderr}`));
      } else resolvePromise({ stdout, stderr, code });
    });
  });
}

function lastJsonLine(text) {
  return text
    .trim()
    .split("\n")
    .reverse()
    .find((line) => line.trim().startsWith("{" ) || line.trim().startsWith("["));
}

const accountsTable = `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", {
  key: text("key").primaryKey(),
  company: text("company").notNull(),
  score: integer("score").notNull(),
  reason: text("reason").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const approvalEffects = sqliteTable("approval_effects", {
  key: text("key").primaryKey(),
  updatedAt: integer("updated_at").notNull(),
});
`;

const localWorkflow = `/**
 * Proves the local paid-call and checkpoint path.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: mock-data organization-lookup-v1 $0.02 per row
 * Table: accounts | key: fixture account id
 */
import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import { accounts } from "../db/tables/accounts";
import { agent } from "../lib/agent";
import { checkpoint, type WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { provider } from "../lib/provider";
import { updateRun } from "../lib/steps";

export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 25;
export const MAX_SPEND_USD = 5;
export const COST_PER_ROW_USD = 0.1;

async function enrichAccount(row: Input["rows"][number], meta: WorkflowMeta) {
  "use step";
  const vendor = await provider({
    name: "mock-data",
    endpoint: "organization-lookup-v1",
    input: { domain: row.domain },
    schema: z.object({ company: z.string() }),
    ttlMs: 86400000,
    costUsd: 0.02,
    call: async () => {
      const response = await fetch(process.env.MOCK_VENDOR_URL + "?domain=" + encodeURIComponent(row.domain));
      return response.json();
    },
    meta,
  });
  const rowSchema = createInsertSchema(accounts).pick({ score: true, reason: true });
  const scored = await agent({
    prompt: "Score " + vendor.value.company,
    schema: rowSchema,
    tools: "none",
    maxUsd: 0.08,
    meta,
  });
  return { key: row.key, company: vendor.value.company, ...scored, costUsd: vendor.costUsd + 0.08 };
}
enrichAccount.maxRetries = 0;

async function saveAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [row]);
}

export async function localProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  const projected = arg.rows.length * COST_PER_ROW_USD;
  if (arg.rows.length > MAX_ROWS || projected > MAX_SPEND_USD) throw new Error("Accepted workflow limits exceeded");
  const completed: string[] = [];
  const failed: { key: string; error: string }[] = [];
  let spentUsd = 0;
  for (const row of arg.rows) {
    try {
      const result = await enrichAccount(row, meta);
      spentUsd += result.costUsd;
      await saveAccount({ ...result, costUsd: undefined, updatedAt: Date.now() });
      completed.push(row.key);
    } catch (error) {
      failed.push({ key: row.key, error: String(error) });
    }
    if (completed.length + failed.length === meta.checkpoint) {
      const decision = await checkpoint(meta, {
        completed: completed.length,
        failed: failed.length,
        spentUsd,
        projectedRemainingUsd: (arg.rows.length - completed.length - failed.length) * COST_PER_ROW_USD,
        table: "accounts",
      });
      if (!decision.approved) break;
    }
  }
  await updateRun(meta.runKey, { status: "completed", completed: completed.length, failed: failed.length, cost_usd: spentUsd, finished: true });
  return { completed, failed };
}
`;

const approvalWorkflow = `/**
 * Proves approval, denial, and timeout.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: none
 * Table: approval_effects | key: approval case
 */
import { z } from "zod";
import { approvalEffects } from "../db/tables/accounts";
import { approve, type WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { updateRun } from "../lib/steps";
export const input = z.object({ case: z.string(), timeoutMs: z.number().optional() });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 0;
export const COST_PER_ROW_USD = 0;
async function recordApproval(key: string) {
  "use step";
  await upsertRows(approvalEffects, [{ key, updatedAt: Date.now() }]);
}
export async function approvalProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  const decision = await approve({ stage: "outreach", summary: "Approve fixture side effect", meta, timeoutMs: arg.timeoutMs });
  if (decision.approved) await recordApproval(arg.case);
  await updateRun(meta.runKey, { status: "completed", completed: decision.approved ? 1 : 0, failed: 0, cost_usd: 0, finished: true });
  return decision;
}
`;

const scheduledWorkflow = `/**
 * Proves scheduled duplicate protection.
 * Runs: on this computer
 * Kind: scheduled
 * Schedule: 0 9 * * *
 * Owner: Fixture | ICP: Fixture
 * Providers: none
 */
import { z } from "zod";
import { approve, type WorkflowMeta } from "../lib/approve";
import { updateRun } from "../lib/steps";
export const input = z.object({ date: z.string() });
type Input = z.infer<typeof input>;
export const scheduledInput = { date: "fixture" };
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 0;
export const COST_PER_ROW_USD = 0;
export async function scheduledProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg ??= scheduledInput;
  arg = input.parse(arg);
  await approve({ stage: "scheduled", summary: "Hold scheduled fixture", meta });
  await updateRun(meta.runKey, { status: "completed", completed: 1, failed: 0, cost_usd: 0, finished: true });
  return arg;
}
`;

const webhookWorkflow = `/**
 * Proves a per-run webhook pause.
 * Runs: on Vercel
 * Kind: triggered
 * Owner: Fixture | ICP: Fixture
 * Providers: none
 */
import { createWebhook } from "workflow";
import { z } from "zod";
import type { WorkflowMeta } from "../lib/approve";
import { updateRun } from "../lib/steps";
export const input = z.object({ event: z.string() });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 0;
export const COST_PER_ROW_USD = 0;
export async function webhookProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  const webhook = createWebhook();
  await updateRun(meta.runKey, { status: "waiting", webhook_url: webhook.url });
  await webhook;
  await updateRun(meta.runKey, { status: "running" });
  await updateRun(meta.runKey, { status: "completed", completed: 1, failed: 0, cost_usd: 0, finished: true });
  return arg;
}
`;
