import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

const repo = resolve(import.meta.dirname, "../../..");
const templates = join(repo, "skills/gtm-workflow/templates");

test("v10 templates pass the deterministic workflow contract", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "gtm-workflow-v10-"));
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
  await writeFile(join(directory, "workflows/trigger-proof.ts"), triggerWorkflow);
  await writeFile(join(directory, "workflows/slow-proof.ts"), slowWorkflow);
  await writeFile(join(directory, "workflows/error-proof.ts"), errorWorkflow);
  await writeFile(join(directory, "workflows/spend-proof.ts"), spendWorkflow);
  await writeFile(join(directory, "workflows/held-proof.ts"), heldWorkflow);
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
    const send = () => response.end(
      JSON.stringify({
        company: url.searchParams.get("domain"),
        providerRecordId: `vendor-${vendorCalls}`,
      }),
    );
    if (url.searchParams.get("domain") === "slow.test") setTimeout(send, 5_000);
    else send();
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
    FIXTURE_API_TOKEN: "credential-to-redact",
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
  const checked = JSON.parse(lastJsonLine(check.stdout));
  assert.equal(checked.ok, true);
  assert.equal(checked.workflows, 8);
  assert.equal(checked.libVersion, 10);
  await command("npm", ["run", "db:verify"], { cwd: directory, env });
  const migrationPath = join(directory, "drizzle/0002_abandoned_quentin_quire.sql");
  const migrationSource = await readFile(migrationPath, "utf8");
  await writeFile(migrationPath, `${migrationSource}\n-- changed after apply\n`);
  const editedLedger = await commandFailure("npm", ["run", "db:verify"], { cwd: directory, env });
  assert.match(editedLedger.stderr, /Migration ledger is missing/);
  await writeFile(migrationPath, migrationSource);
  await assertCheckRules(directory, env);
  await writeFile(
    join(directory, ".env.turso"),
    "TURSO_DATABASE_URL=libsql://fixture.turso.io\nTURSO_AUTH_TOKEN=\n",
  );
  const missingCloudToken = await commandFailure("npm", ["run", "db:migrate:cloud"], {
    cwd: directory,
    env,
  });
  assert.match(missingCloudToken.stderr, /TURSO_AUTH_TOKEN must be non-empty/);
  const writeOnlyCloudQuery = await gtmFailure(directory, env, ["query", "--cloud", "--sql", "SELECT 1"]);
  assert.equal(writeOnlyCloudQuery.error.code, "missing_read_only_token");
  const writeOnlyCloudStudio = await commandFailure("npm", ["run", "db:studio:cloud"], { cwd: directory, env });
  assert.match(writeOnlyCloudStudio.stderr, /TURSO_READ_ONLY_AUTH_TOKEN is required/);
  await rm(join(directory, ".env.turso"));
  await command("npm", ["run", "build"], { cwd: directory, env });
  await writeFile(join(directory, "drizzle/9999_orphan.sql"), "SELECT 1;\n");
  const orphanMigration = await gtmFailure(directory, env, ["check"]);
  assert.equal(orphanMigration.error.code, "invalid_migration_artifacts");
  await rm(join(directory, "drizzle/9999_orphan.sql"));

  const cloudQuery = await gtmFailure(directory, env, ["query", "--cloud", "--sql", "SELECT 1"]);
  assert.equal(cloudQuery.error.code, "missing_cloud_env");

  const localWorkflowPath = join(directory, "workflows/local-proof.ts");
  const validLocalWorkflow = await readFile(localWorkflowPath, "utf8");
  await writeFile(localWorkflowPath, validLocalWorkflow.replace("  arg = input.parse(arg);\n", ""));
  const missingInputParse = await gtmFailure(directory, env, ["check"]);
  assert.equal(missingInputParse.error.code, "invalid_input_parse");
  await writeFile(localWorkflowPath, validLocalWorkflow);
  const malformedInput = join(directory, "data/malformed.json");
  await mkdir(dirname(malformedInput), { recursive: true });
  await writeFile(malformedInput, JSON.stringify({ rows: [{ key: "missing-domain" }] }));
  const malformedDryRun = await gtmFailure(directory, env, ["run", "local-proof", "--input", malformedInput, "--dry-run"]);
  assert.equal(malformedDryRun.error.code, "invalid_input_schema");
  const unrelatedArrayInput = join(directory, "data/unrelated-array.json");
  await writeFile(unrelatedArrayInput, JSON.stringify({ rows: [{ key: "one", domain: "one.test" }], unrelated: [1, 2, 3, 4] }));
  const unrelatedDryRun = await gtm(directory, env, ["run", "local-proof", "--input", unrelatedArrayInput, "--dry-run"]);
  assert.equal(unrelatedDryRun.rows, 1);
  const scheduledNoInput = await gtmFailure(directory, env, ["run", "scheduled-proof"]);
  assert.equal(scheduledNoInput.error.code, "invalid_input");
  assert.match(scheduledNoInput.error.message, /write scheduledInput to a file/);

  // Exercise workflow self-registration without relying on the route's best-effort write.
  const runRoute = join(directory, "server/api/run/[...workflow].ts");
  const runRouteSource = await readFile(runRoute, "utf8");
  await writeFile(
    runRoute,
    runRouteSource.replace(
      "await updateRunPlain(runKey, { runId: run.runId }).catch(() => undefined);",
      "await Promise.resolve();",
    ),
  );
  await command("npm", ["run", "build"], { cwd: directory, env });

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
  const missingHeadStart = await fetch(`${env.GTM_BASE_URL}/api/run/local-proof`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(missingHeadStart.status, 409);
  assert.equal((await missingHeadStart.json()).error.code, "deployment_head_required");
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
  assert.equal(typeof paused.runId, "string");
  assert.equal(typeof paused.runUrl, "string");
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
  const cteQuery = await gtm(directory, env, [
    "query",
    "--sql",
    "WITH selected AS (SELECT key FROM accounts LIMIT 1) SELECT * FROM selected",
  ]);
  assert.equal(cteQuery.length, 1);

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
  const rerunCost = await sqlRows(
    directory,
    env,
    `select cost_usd from workflow_runs where run_key = '${rerun.runKey}'`,
  );
  assert.equal(rerunCost[0].cost_usd, 0);
  const firstCostSources = await sqlRows(
    directory,
    env,
    `select provider, cost_source from enrichment_runs where run_key = '${completed.runKey}' group by provider, cost_source order by provider`,
  );
  assert.deepEqual(firstCostSources, [
    { provider: "agent", cost_source: "reported" },
    { provider: "mock-data", cost_source: "fixed" },
  ]);

  const beforeCapCalls = vendorCalls;
  const capResponse = await httpJson(`${env.GTM_BASE_URL}/api/run/local-proof`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "x-gtm-workspace-head": deploymentHead },
    body: JSON.stringify({ rows: Array.from({ length: 26 }, (_, index) => ({ key: `cap-${index}`, domain: `cap-${index}.test` })) }),
  });
  const capDone = await waitForRun(directory, env, capResponse.runKey, "failed");
  assert.equal(capDone.stopReason, "caps_exceeded");
  assert.equal(vendorCalls, beforeCapCalls);

  const spendInput = join(directory, "data/spend.json");
  await writeFile(spendInput, JSON.stringify({ rows: ["one", "two", "three"].map((key) => ({ key, domain: `spend-${key}.test` })) }));
  const spendDone = await gtm(directory, env, ["run", "spend-proof", "--input", spendInput, "--wait"]);
  assert.equal(spendDone.status, "stopped");
  assert.equal(spendDone.stopReason, "spend_cap");
  assert.equal(spendDone.completed, 2);
  assert.deepEqual(spendDone.remaining_keys, ["three"]);

  const heldInput = join(directory, "data/held.json");
  await writeFile(heldInput, JSON.stringify({ rows: Array.from({ length: 5 }, (_, index) => ({ key: `held-${index}` })) }));
  const heldDone = await gtm(directory, env, ["run", "held-proof", "--input", heldInput, "--wait"]);
  assert.equal(heldDone.status, "stopped");
  assert.equal(heldDone.stopReason, "provider_auth");
  assert.deepEqual(heldDone.remaining_keys, ["held-2", "held-3", "held-4"]);
  assert.equal((await sqlRows(directory, env, `select * from enrichment_runs where run_key = '${heldDone.runKey}'`)).length, 2);

  const denied = await startAndWait(directory, env, "approval-proof", { case: "deny" });
  const hooks = await command("npx", ["workflow", "inspect", "hooks", "--runId", denied.runId], { cwd: directory, env });
  assert.match(hooks.stdout, /hookId/);
  const deniedDone = await gtm(directory, env, ["approve", denied.approval.token, "--no", "--wait"]);
  assert.equal(deniedDone.status, "stopped");
  assert.equal(deniedDone.stopReason, "operator_denied");
  assert.equal(deniedDone.approval.approved, false);
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 0);
  const deniedAgain = await gtmFailure(directory, env, ["approve", denied.approval.token, "--yes"]);
  assert.equal(deniedAgain.error.code, "approval_not_pending");

  const accepted = await startAndWait(directory, env, "approval-proof", { case: "approve" });
  const acceptedDone = await gtm(directory, env, ["approve", accepted.approval.token, "--yes", "--wait"]);
  assert.equal(acceptedDone.status, "completed", JSON.stringify(acceptedDone));
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 1);
  const toCancel = await startAndWait(directory, env, "approval-proof", { case: "cancel" });
  assert.equal(toCancel.status, "waiting");
  const unauthenticatedCancel = await fetch(`${env.GTM_BASE_URL}/api/runs/${toCancel.runKey}/cancel`, { method: "POST" });
  assert.equal(unauthenticatedCancel.status, 401);
  const cancelling = await gtm(directory, env, ["cancel", toCancel.runKey, "--reason", "operator stopped it"]);
  assert.equal(cancelling.status, "cancelling");
  assert.equal(cancelling.finishedAt, null);
  const cancelled = await gtm(directory, env, ["runs", "get", toCancel.runKey, "--wait"]);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.runKey, toCancel.runKey);
  assert.notEqual(cancelled.finishedAt, null);
  assert.match(cancelled.stopReason, /operator stopped it/);
  const cancelledAgain = await gtmFailure(directory, env, ["cancel", toCancel.runKey]);
  assert.equal(cancelledAgain.error.code, "run_not_active");
  const approveAfterCancel = await gtmFailure(directory, env, ["approve", toCancel.approval.token, "--yes"]);
  assert.equal(approveAfterCancel.error.code, "approval_not_pending");
  assert.equal((await gtm(directory, env, ["runs", "get", toCancel.runKey])).status, "cancelled");
  assert.equal((await tableRows(directory, env, "approval_effects")).length, 1);
  const timed = await startAndWait(directory, env, "approval-proof", { case: "timeout", timeoutMs: 100 });
  const timedDone = await waitForRun(directory, env, timed.runKey, "timed_out");
  assert.equal(timedDone.approval.approved, false);
  assert.equal(timedDone.approval.comment, "timeout");
  assert.equal(timedDone.stopReason, "approval_timeout");

  const scheduledStart = await httpJson(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const scheduledWait = await waitForRun(directory, env, scheduledStart.runKey, "waiting");
  assert.equal(scheduledWait.method, "GET");
  const scheduledDuplicate = await httpJson(`${env.GTM_BASE_URL}/api/run/scheduled-proof`, {
    headers: { authorization: `Bearer ${secret}` },
  }, 409);
  assert.equal(scheduledDuplicate.error.code, "already_ran_today");
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

  const catchupDate = "2026-08-27";
  const catchup = await gtm(directory, env, [
    "run",
    "scheduled-proof",
    "--input",
    scheduledInput,
    "--scheduled-for",
    catchupDate,
  ]);
  const catchupWait = await waitForRun(directory, env, catchup.runKey, "waiting");
  assert.equal(catchupWait.scheduledFor, catchupDate);
  await gtm(directory, env, ["approve", catchupWait.approval.token, "--no", "--wait"]);

  const concurrentDate = "2026-08-26";
  const concurrent = await Promise.all([
    fetch(`${env.GTM_BASE_URL}/api/run/scheduled-proof?scheduled-for=${concurrentDate}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-gtm-workspace-head": deploymentHead },
      body: JSON.stringify({ date: "concurrent" }),
    }),
    fetch(`${env.GTM_BASE_URL}/api/run/scheduled-proof?scheduled-for=${concurrentDate}`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", "x-gtm-workspace-head": deploymentHead },
      body: JSON.stringify({ date: "concurrent" }),
    }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
  const concurrentBodies = await Promise.all(concurrent.map((response) => response.json()));
  const concurrentStart = concurrentBodies.find((body) => body.runKey && !body.error);
  const concurrentWait = await waitForRun(directory, env, concurrentStart.runKey, "waiting");
  await gtm(directory, env, ["approve", concurrentWait.approval.token, "--no", "--wait"]);

  const triggered = await startAndWait(directory, env, "trigger-proof", { event: "fixture" });
  assert.equal(typeof triggered.trigger_token, "string");
  const unauthenticatedTrigger = await fetch(`${env.GTM_BASE_URL}/api/runs/${triggered.runKey}/trigger`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true }),
  });
  assert.equal(unauthenticatedTrigger.status, 401);
  const triggerResponse = await httpJson(`${env.GTM_BASE_URL}/api/runs/${triggered.runKey}/trigger`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    body: JSON.stringify({ ok: true }),
  });
  assert.equal(triggerResponse.accepted, true);
  assert.equal((await waitForRun(directory, env, triggered.runKey, "completed")).status, "completed");

  const slowInput = join(directory, "data/slow.json");
  await writeFile(slowInput, JSON.stringify({ rows: [{ key: "slow", domain: "slow.test" }] }));
  const slow = await gtm(directory, env, ["run", "slow-proof", "--input", slowInput]);
  await waitForLedgerStatus(directory, env, slow.runKey, "pending");
  const slowCancelling = await gtm(directory, env, ["cancel", slow.runKey, "--reason", "fixture cancellation"]);
  assert.equal(slowCancelling.status, "cancelling");
  assert.equal(slowCancelling.finishedAt, null);
  const slowDuplicate = await gtmFailure(directory, env, ["run", "slow-proof", "--input", slowInput]);
  assert.equal(slowDuplicate.error.code, "run_in_progress");
  const slowCancelled = await gtm(directory, env, ["runs", "get", slow.runKey, "--wait"]);
  assert.equal(slowCancelled.status, "cancelled");
  assert.notEqual(slowCancelled.finishedAt, null);

  const errorInput = join(directory, "data/error.json");
  await writeFile(errorInput, JSON.stringify({ key: "error" }));
  const errorDone = await gtm(directory, env, ["run", "error-proof", "--input", errorInput, "--wait"]);
  const errorText = JSON.stringify(errorDone);
  assert.equal(errorDone.status, "failed");
  assert.equal(errorDone.failedStep, "failWithCredential");
  assert.doesNotMatch(errorText, /credential-to-redact/);
  assert.doesNotMatch(errorText, /api_key=/i);
  const errorLedger = await sqlRows(directory, env, `select error from enrichment_runs where run_key = '${errorDone.runKey}'`);
  assert.doesNotMatch(JSON.stringify(errorLedger), /credential-to-redact/);

  const agentCountBeforeContext = (await readFile(fakeCount, "utf8")).length;
  await agentProbe(directory, env, { runKey: "context-a", context: "ICP alpha" });
  await agentProbe(directory, env, { runKey: "context-b", context: "ICP beta" });
  await agentProbe(directory, env, { runKey: "context-b-hit", context: "ICP beta" });
  assert.equal((await readFile(fakeCount, "utf8")).length - agentCountBeforeContext, 2);

  await assertNonEnforcingBackendStopsBeforeSpawn(directory, env);
  await assertMissingCliCostsZero(directory, env);
  await assertCacheParseFailureLedger(directory, env);
  await assertLostPendingReconcile(directory, env);
  await assertPartialUpsertMerge(directory, env);
  await assertCommandPermissions(repo);

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
  await assertDirtyProductionStartRefused(directory, env, inputFile, nitroPort);
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

async function waitForLedgerStatus(directory, env, runKey, status) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const rows = await sqlRows(directory, env, `select status from enrichment_runs where run_key = '${runKey}'`);
    if (rows.some((row) => row.status === status)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`run ${runKey} did not record ledger status ${status}`);
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
      parseRaw: (raw) => raw,
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

async function agentProbe(directory, env, options) {
  const script = `
    const [{ agent }, { z }] = await Promise.all([import("./lib/agent.ts"), import("zod")]);
    const value = await agent({
      prompt: "Context cache fixture",
      context: ${JSON.stringify(options.context)},
      contextId: "icps/fixture.md",
      schema: z.object({ score: z.number(), reason: z.string() }),
      tools: "none",
      maxUsd: 0.08,
      meta: { runKey: ${JSON.stringify(options.runKey)}, slug: "agent-probe" },
    });
    process.stdout.write(JSON.stringify(value));
  `;
  return command(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: directory, env });
}

async function assertNonEnforcingBackendStopsBeforeSpawn(directory, env) {
  const marker = join(directory, "codex-spawned");
  const fakeCodex = join(directory, "fake-bin/codex");
  await writeFile(fakeCodex, `#!/bin/sh\nprintf spawned > "${marker}"\n`);
  await chmod(fakeCodex, 0o755);
  const script = `
    const [{ agent }, { z }] = await Promise.all([import("./lib/agent.ts"), import("zod")]);
    await agent({ prompt: "untrusted", schema: z.object({ ok: z.boolean() }), tools: "none", meta: { runKey: "unsafe-backend", slug: "agent-probe" } });
  `;
  const result = await commandFailure(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: directory,
    env: { ...env, GTM_AGENT_BACKEND: "codex" },
  });
  assert.match(result.stderr, /cannot enforce tools/);
  await assert.rejects(readFile(marker));
}

async function assertMissingCliCostsZero(directory, env) {
  const emptyPath = join(directory, "empty-path");
  await mkdir(emptyPath);
  const script = `
    const [{ agent }, { z }] = await Promise.all([import("./lib/agent.ts"), import("zod")]);
    await agent({ prompt: "missing cli", schema: z.object({ ok: z.boolean() }), tools: "none", maxUsd: 0.5, meta: { runKey: "missing-cli", slug: "agent-probe" } });
  `;
  await commandFailure(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: directory,
    env: { ...env, PATH: emptyPath, GTM_AGENT_BACKEND: "claude" },
  });
  const rows = await sqlRows(directory, env, "select status, cost_usd, error_kind from enrichment_runs where run_key = 'missing-cli'");
  assert.deepEqual(rows, [{ status: "error", cost_usd: 0, error_kind: "pre_call" }]);
}

async function assertCacheParseFailureLedger(directory, env) {
  const script = `
    const [{ createHash }, { provider }, { getDb }, { enrichmentCache }, { z }] = await Promise.all([
      import("node:crypto"), import("./lib/provider.ts"), import("./lib/db.ts"), import("./lib/schema.ts"), import("zod")
    ]);
    const input = { domain: "bad-cache.test" };
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    await (await getDb()).insert(enrichmentCache).values({ provider: "bad-cache", endpoint: "lookup", inputsHash: hash, inputs: JSON.stringify(input), raw: "{}", value: "{}", expiresAt: Date.now() + 10000, createdAt: Date.now() });
    try {
      await provider({ name: "bad-cache", endpoint: "lookup", input, schema: z.object({ company: z.string() }), ttlMs: 10000, call: async () => ({ company: "never" }), meta: { runKey: "cache-parse", slug: "provider-probe" } });
    } catch {}
  `;
  await command(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: directory, env });
  const rows = await sqlRows(directory, env, "select status, error_kind from enrichment_runs where run_key = 'cache-parse'");
  assert.deepEqual(rows, [{ status: "error", error_kind: "cache_parse" }]);
}

async function assertLostPendingReconcile(directory, env) {
  const script = `
    const [{ randomUUID }, { getDb, reconcileRun }, { enrichmentRuns, workflowRuns }] = await Promise.all([
      import("node:crypto"), import("./lib/db.ts"), import("./lib/schema.ts")
    ]);
    const db = await getDb();
    await db.insert(workflowRuns).values({ runKey: "lost-run", runId: "missing-sdk-run", workflow: "lost", path: "lost", method: "POST", input: "{}", inputHash: "lost-hash", status: "running", startedAt: Date.now() });
    await db.insert(enrichmentRuns).values({ id: randomUUID(), runKey: "lost-run", workflow: "lost", provider: "fixture", endpoint: "lookup", inputsHash: "hash", status: "pending", costUsd: 0.4, costSource: "fixed", createdAt: Date.now() });
    await reconcileRun("lost-run");
    await db.insert(workflowRuns).values({ runKey: "never-started", runId: null, workflow: "never", path: "never", method: "POST", input: "{}", inputHash: "never-hash", status: "running", startedAt: Date.now() - 601000 });
    await reconcileRun("never-started");
  `;
  await command(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: directory, env });
  const ledger = await sqlRows(directory, env, "select status, cost_usd, error_kind from enrichment_runs where run_key = 'lost-run'");
  assert.deepEqual(ledger, [{ status: "lost", cost_usd: 0.4, error_kind: "lost" }]);
  const run = await sqlRows(directory, env, "select status, cost_usd from workflow_runs where run_key = 'lost-run'");
  assert.deepEqual(run, [{ status: "failed", cost_usd: 0.4 }]);
  const neverStarted = await sqlRows(directory, env, "select status, error from workflow_runs where run_key = 'never-started'");
  assert.deepEqual(neverStarted, [{ status: "failed", error: "start not recorded" }]);
}

async function assertPartialUpsertMerge(directory, env) {
  const script = `
    const [{ upsertRows }, { mergeRows }] = await Promise.all([import("./lib/db.ts"), import("./db/tables/accounts.ts")]);
    await upsertRows(mergeRows, [{ key: "merge", alpha: "A", updatedAt: 1 }]);
    await upsertRows(mergeRows, [{ key: "merge", beta: "B", updatedAt: 2 }]);
  `;
  await command(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { cwd: directory, env });
  const rows = await sqlRows(directory, env, "select key, alpha, beta, updated_at from merge_rows");
  assert.deepEqual(rows, [{ key: "merge", alpha: "A", beta: "B", updated_at: 2 }]);
}

async function assertCommandPermissions(repo) {
  const script = join(repo, "skills/gtm-workflow/scripts/command-permission.mjs");
  const cases = [
    ["npm run gtm -- check", "allow"],
    ["npm run gtm -- query --sql 'SELECT 1'", "allow"],
    ["npm run gtm -- runs get abc", "allow"],
    ["npm run gtm -- run proof --input rows.json --dry-run", "allow"],
    ["npx workflow inspect runs", "allow"],
    ["npm run db:studio:cloud", "allow"],
    ["npm run gtm -- run proof --input rows.json", "ask"],
    ["npm run gtm -- approve token --yes", "ask"],
    ["npm run db:migrate", "ask"],
    ["vercel deploy", "ask"],
    ["npm run gtm -- check; npm run gtm -- run proof", "ask"],
    ["npm run gtm -- query --sql $SQL", "ask"],
  ];
  for (const [sample, expected] of cases) {
    const result = await command(process.execPath, [script, "--classify", sample], { cwd: repo, env: process.env });
    assert.equal(JSON.parse(result.stdout).decision, expected, sample);
  }
}

async function assertCheckRules(directory, env) {
  const localPath = join(directory, "workflows/local-proof.ts");
  const triggerPath = join(directory, "workflows/trigger-proof.ts");
  const tablePath = join(directory, "db/tables/accounts.ts");
  const migrationPath = join(directory, "drizzle/0002_abandoned_quentin_quire.sql");
  const providerPath = join(directory, "lib/provider.ts");

  await expectCheckViolation(localPath, (source) => source.replace("enrichAccount.maxRetries = 0;", ""), "paid_step_retries", directory, env);
  await expectCheckViolation(localPath, (source) => source.replace('  arg = input.parse(arg);', '  arg = input.parse(arg);\n  Date.now();'), "nondeterministic_workflow", directory, env);
  await expectCheckViolation(triggerPath, (source) => source.replace('  await updateRun(meta.runKey, { status: "completed", completed: 1, failed: 0, cost_usd: 0, finished: true });', '  return arg;'), "missing_terminal_bookkeeping", directory, env);
  await expectCheckViolation(triggerPath, (source) => `${source}\nconst forbiddenAtModuleScope = fetch("https://invalid.test");\n`, "invalid_module_scope", directory, env);
  await expectCheckViolation(tablePath, (source) => source.replaceAll(".primaryKey()", ""), "invalid_result_table", directory, env);
  await expectCheckViolation(migrationPath, (source) => `${source}\nDELETE FROM workflow_runs;\n`, "destructive_migration", directory, env);
  await expectCheckViolation(migrationPath, (source) => `${source}\nALTER TABLE workflow_runs RENAME TO old_workflow_runs;\n`, "destructive_migration", directory, env);
  await expectCheckViolation(providerPath, (source) => source.replace("// gtm-lib v10\n", "// gtm-lib v10\n\n"), "lib_modified", directory, env);
}

async function assertDirtyProductionStartRefused(directory, env, inputFile, nitroPort) {
  const workflowPath = join(directory, "workflows/local-proof.ts");
  const packagePath = join(directory, "package.json");
  const workflow = (await readFile(workflowPath, "utf8")).replace("Runs: on this computer", "Runs: on Vercel");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  packageJson.gtm.vercel = { url: `http://127.0.0.1:${nitroPort}` };
  await writeFile(workflowPath, workflow);
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await command("git", ["init", "-q"], { cwd: directory, env });
  await command("git", ["config", "user.email", "fixture@example.invalid"], { cwd: directory, env });
  await command("git", ["config", "user.name", "Fixture"], { cwd: directory, env });
  await command("git", ["add", "-A"], { cwd: directory, env });
  await command("git", ["commit", "-qm", "fixture"], { cwd: directory, env });
  await writeFile(join(directory, "dirty-workspace"), "dirty\n");
  const cleanEnv = { ...env };
  delete cleanEnv.GTM_BASE_URL;
  delete cleanEnv.VERCEL_GIT_COMMIT_SHA;
  const refused = await gtmFailure(directory, cleanEnv, ["run", "local-proof", "--input", inputFile]);
  assert.equal(refused.error.code, "deployment_workspace_dirty");
}

async function expectCheckViolation(path, mutate, code, directory, env) {
  const source = await readFile(path, "utf8");
  await writeFile(path, mutate(source));
  try {
    const result = await gtmFailure(directory, env, ["check"]);
    assert.equal(result.error.code, code, `${relative(directory, path)} should fail ${code}`);
  } finally {
    await writeFile(path, source);
  }
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

export const mergeRows = sqliteTable("merge_rows", {
  key: text("key").primaryKey(),
  alpha: text("alpha"),
  beta: text("beta"),
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
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { provider } from "../lib/provider";
import { runRows } from "../lib/rows";

export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 25;
export const MAX_SPEND_USD = 5;
export const COST_PER_ROW_USD = 0.1;

async function enrichAccount(row: Input["rows"][number], meta: WorkflowMeta, signal: AbortSignal) {
  "use step";
  const vendor = await provider({
    name: "mock-data",
    endpoint: "organization-lookup-v1",
    input: { domain: row.domain },
    schema: z.object({ company: z.string() }),
    ttlMs: 86400000,
    costUsd: 0.02,
    call: async () => {
      const response = await fetch(process.env.MOCK_VENDOR_URL + "?domain=" + encodeURIComponent(row.domain), { signal });
      const raw = await response.json();
      return { raw, value: raw };
    },
    parseRaw: (raw) => raw,
    meta,
  });
  const rowSchema = createInsertSchema(accounts).pick({ score: true, reason: true });
  const scored = await agent({
    prompt: "Score " + vendor.value.company,
    context: "Accepted ICP: fixture companies.",
    contextId: "icps/fixture.md",
    schema: rowSchema,
    tools: "none",
    maxUsd: 0.08,
    meta,
    signal,
  });
  return { key: row.key, value: { company: vendor.value.company, ...scored } };
}
enrichAccount.maxRetries = 0;

async function saveAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]);
}

export async function localProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({
    rows: arg.rows,
    meta,
    table: { name: "accounts", save: saveAccount },
    rowStep: enrichAccount,
    caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD },
  });
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
  await updateRun(meta.runKey, { status: decision.outcome === "approved" ? "completed" : decision.outcome === "timed_out" ? "timed_out" : "stopped", completed: decision.approved ? 1 : 0, failed: 0, cost_usd: 0, finished: true });
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
  const decision = await approve({ stage: "scheduled", summary: "Hold scheduled fixture", meta });
  await updateRun(meta.runKey, { status: decision.approved ? "completed" : "stopped", completed: decision.approved ? 1 : 0, failed: 0, cost_usd: 0, finished: true });
  return arg;
}
`;

const triggerWorkflow = `/**
 * Proves an authorized trigger pause.
 * Runs: on Vercel
 * Kind: triggered
 * Owner: Fixture | ICP: Fixture
 * Providers: none
 */
import { z } from "zod";
import { waitForTrigger, type WorkflowMeta } from "../lib/approve";
import { updateRun } from "../lib/steps";
export const input = z.object({ event: z.string() });
const payload = z.object({ ok: z.boolean() });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 0;
export const COST_PER_ROW_USD = 0;
export async function triggerProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  payload.parse(await waitForTrigger(meta));
  await updateRun(meta.runKey, { status: "completed", completed: 1, failed: 0, cost_usd: 0, finished: true });
  return arg;
}
`;

const slowWorkflow = `/**
 * Proves cancelling keeps the duplicate guard closed during a paid step.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: mock-data slow-lookup $0.02 per row
 * Table: accounts | key: fixture account id
 */
import { z } from "zod";
import { accounts } from "../db/tables/accounts";
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { provider } from "../lib/provider";
import { runRows } from "../lib/rows";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 1;
export const COST_PER_ROW_USD = 0.02;
async function slowLookup(row: Input["rows"][number], meta: WorkflowMeta) {
  "use step";
  const result = await provider({
    name: "mock-data", endpoint: "slow-lookup", input: { domain: row.domain }, schema: z.object({ company: z.string() }), ttlMs: 1000, costUsd: 0.02,
    call: async () => (await fetch(process.env.MOCK_VENDOR_URL + "?domain=" + encodeURIComponent(row.domain))).json(), meta,
  });
  return { key: row.key, value: { company: result.value.company, score: 1, reason: "slow" } };
}
slowLookup.maxRetries = 0;
async function saveSlow(row: Record<string, unknown>) { "use step"; await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]); }
export async function slowProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveSlow }, rowStep: slowLookup, caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}
`;

const errorWorkflow = `/**
 * Proves defensive error redaction.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: error-vendor lookup $0.02 per row
 */
import { z } from "zod";
import type { WorkflowMeta } from "../lib/approve";
import { provider } from "../lib/provider";
import { updateRun } from "../lib/steps";
export const input = z.object({ key: z.string() });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 1;
export const MAX_SPEND_USD = 1;
export const COST_PER_ROW_USD = 0.02;
async function failWithCredential(_key: string, meta: WorkflowMeta) {
  "use step";
  return provider({ name: "error-vendor", endpoint: "lookup", input: {}, schema: z.object({ ok: z.boolean() }), ttlMs: 1000, costUsd: 0.02, call: async () => { throw new Error("request failed https://vendor.invalid/path?api_key=" + process.env.FIXTURE_API_TOKEN); }, meta });
}
failWithCredential.maxRetries = 0;
export async function errorProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  try { await failWithCredential(arg.key, meta); }
  catch (error) { await updateRun(meta.runKey, { status: "failed", error: String(error), failed_step: "failWithCredential", finished: true }); throw error; }
  await updateRun(meta.runKey, { status: "completed", completed: 1, failed: 0, finished: true });
}
`;

const spendWorkflow = `/**
 * Proves the ledger-based mid-run spend stop.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: mock-data spend-lookup $0.03 per row
 * Table: accounts | key: fixture account id
 */
import { z } from "zod";
import { accounts } from "../db/tables/accounts";
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { provider } from "../lib/provider";
import { runRows } from "../lib/rows";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 5;
export const MAX_SPEND_USD = 0.05;
export const COST_PER_ROW_USD = 0.01;
async function spendLookup(row: Input["rows"][number], meta: WorkflowMeta) {
  "use step";
  const result = await provider({ name: "mock-data", endpoint: "spend-lookup", input: { domain: row.domain }, schema: z.object({ company: z.string() }), ttlMs: 1000, costUsd: 0.03, call: async () => (await fetch(process.env.MOCK_VENDOR_URL + "?domain=" + encodeURIComponent(row.domain))).json(), meta });
  return { key: row.key, value: { company: result.value.company, score: 1, reason: "spend" } };
}
spendLookup.maxRetries = 0;
async function saveSpend(row: Record<string, unknown>) { "use step"; await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]); }
export async function spendProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveSpend }, rowStep: spendLookup, caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}
`;

const heldWorkflow = `/**
 * Proves authentication failures hold the run.
 * Runs: on this computer
 * Kind: on-demand
 * Owner: Fixture | ICP: Fixture
 * Providers: held-vendor lookup $0.01 per row
 * Table: accounts | key: fixture account id
 */
import { z } from "zod";
import { accounts } from "../db/tables/accounts";
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { provider, ProviderAuthError } from "../lib/provider";
import { runRows } from "../lib/rows";
export const input = z.object({ rows: z.array(z.object({ key: z.string() })) });
type Input = z.infer<typeof input>;
export const MAX_ROWS = 5;
export const MAX_SPEND_USD = 1;
export const COST_PER_ROW_USD = 0.01;
async function heldLookup(row: Input["rows"][number], meta: WorkflowMeta) {
  "use step";
  const result = await provider({ name: "held-vendor", endpoint: "lookup", input: { key: row.key }, schema: z.object({ company: z.string() }), ttlMs: 1000, costUsd: 0.01, call: async () => { if (row.key === "held-1") throw new ProviderAuthError("credential rejected"); return { company: row.key }; }, meta });
  return { key: row.key, value: { company: result.value.company, score: 1, reason: "held" } };
}
heldLookup.maxRetries = 0;
async function saveHeld(row: Record<string, unknown>) { "use step"; await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]); }
export async function heldProof(arg: Input, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveHeld }, rowStep: heldLookup, caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}
`;
