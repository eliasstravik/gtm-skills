import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, db } from "../templates/lib/db";
import { testDatabase } from "./db";
after(() => closeDb());
import { configureLocalRuntime } from "../templates/lib/local-runtime";
import { failureDetails, rowFailure } from "../templates/lib/failure";
import { runAgentCli } from "../templates/lib/cli";
import { callMcpTool } from "../templates/lib/mcp";
import { runRows } from "../templates/lib/rows";
import { startLookup, pollLookup } from "../templates/lib/profiles/provider";
import { beginRun } from "../templates/lib/profiles/ledger";
import { compareVersions, mergePackage } from "../scripts/upgrade-package.mjs";
import { localEnvironment } from "../templates/scripts/local-launch.mjs";

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as any).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 6000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(check(), "fixture completed within six seconds");
}
async function capture(fn: (logs: unknown[][]) => Promise<void>) {
  const logs: unknown[][] = [],
    original = console.error;
  console.error = (...args) => {
    logs.push(args);
  };
  try {
    await fn(logs);
  } finally {
    console.error = original;
  }
}

test("package upgrade adds new commands, merges dependencies, and sends changed commands for review", () => {
  const template = {
    version: "0.1.42",
    scripts: {
      dev: "stock dev",
      build: "stock build",
      viewer: "viewer command",
    },
    dependencies: { workflow: "new" },
    devDependencies: { typescript: "new" },
  };
  const old = {
    name: "customer",
    version: "0.1.0",
    scripts: {
      dev: "stock dev",
      build: "PORT=4444 npm run prepare && stock build",
      custom: "keep",
    },
    dependencies: { workflow: "old", customer: "keep" },
    extra: { keep: true },
  };
  const result = mergePackage(old, template);
  assert.equal(result.package.version, "0.1.42");
  assert.equal(result.package.scripts.dev, "stock dev");
  assert.equal(result.package.scripts.viewer, "viewer command", "a missing command is added");
  assert.equal(result.package.scripts.build, "PORT=4444 npm run prepare && stock build", "a customised command is kept");
  assert.deepEqual(result.review, ["build"]);
  assert.equal(result.package.scripts.custom, "keep");
  assert.equal(result.package.dependencies.workflow, "new");
  assert.equal(result.package.dependencies.customer, "keep");
  assert.deepEqual(result.package.extra, { keep: true });
  assert.equal(old.dependencies.workflow, "old");
});

test("package upgrade refuses a template older than the workspace", () => {
  const pkg = (version: string) => ({ version, scripts: {}, dependencies: {}, devDependencies: {} });
  assert.throws(() => mergePackage(pkg("0.2.1"), pkg("0.2.0")), /never downgrade/);
  assert.throws(() => mergePackage(pkg("0.10.0"), pkg("0.9.9")), /never downgrade/);
  assert.equal(mergePackage(pkg("0.2.0"), pkg("0.2.0")).package.version, "0.2.0");
  assert.equal(mergePackage(pkg("0.1.63"), pkg("0.2.0")).package.version, "0.2.0");
  assert.equal(compareVersions("1.0.0", "0.99.99"), 1);
});

test("npm run dev never loads production wiring from .env files, and says so", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-env-"));
  try {
    await writeFile(join(dir, ".env"), "GTM_MODEL=a\nGTM_RUN_SECRET=old\nGTM_AGENT_URL=https://agent.example\nGTM_NOTIFY_SECRET=n\n");
    await writeFile(join(dir, ".env.local"), "APOLLO_API_KEY=k\nGTM_WORKFLOW_URL=https://prod.example\n");
    const warnings: string[] = [];
    const env = localEnvironment(dir, { SHELL_ONLY: "1" }, (line: string) => warnings.push(line));
    assert.equal(env.GTM_MODEL, "a");
    assert.equal(env.APOLLO_API_KEY, "k");
    assert.equal(env.SHELL_ONLY, "1");
    for (const name of ["GTM_RUN_SECRET", "GTM_AGENT_URL", "GTM_NOTIFY_SECRET", "GTM_WORKFLOW_URL"]) assert.equal(env[name], undefined, name);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /workflows\/\.env: /);
    for (const name of ["GTM_RUN_SECRET", "GTM_AGENT_URL", "GTM_NOTIFY_SECRET"]) assert.ok(warnings[0].includes(name), name);
    assert.match(warnings[1], /workflows\/\.env\.local: GTM_WORKFLOW_URL/);
    // A value from the shell is the caller's own choice (a local notify listener, say) and stays.
    assert.equal(localEnvironment(dir, { GTM_AGENT_URL: "http://127.0.0.1:9" }, () => {}).GTM_AGENT_URL, "http://127.0.0.1:9");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("local config supplies missing defaults and keeps explicit overrides, including zero", () => {
  delete process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS;
  delete process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS;
  configureLocalRuntime();
  assert.equal(process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS, "900000");
  assert.equal(process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS, "900000");
  process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS = "0";
  process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS = "70000";
  configureLocalRuntime();
  assert.equal(process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS, "0");
  assert.equal(process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS, "70000");
});

test("real SDK queue distinguishes header and body timeouts; unchanged delayed response succeeds with defaults", async () => {
  const { createQueue } = await import(
    new URL("./queue.js", import.meta.resolve("@workflow/world-local")).href
  );
  for (const mode of ["headers", "body", "protected"]) {
    process.env.WORKFLOW_LOCAL_HEADERS_TIMEOUT_MS =
      mode === "headers" ? "20" : "900000";
    process.env.WORKFLOW_LOCAL_BODY_TIMEOUT_MS =
      mode === "body" ? "20" : "900000";
    let requests = 0,
      completed = 0;
    const server = createServer(async (req, res) => {
      requests++;
      req.resume();
      if (mode === "body") {
        res.writeHead(200);
        res.write('{"waiting":');
      }
      await delay(1800);
      if (!res.destroyed) {
        res.end(mode === "body" ? "true}" : "{}");
        completed++;
      }
    });
    const url = await listen(server);
    const queue = createQueue({ baseUrl: url });
    try {
      await capture(async (logs) => {
        await queue.queue("__wkf_workflow_fixture", { runId: "wrun_fixture" });
        if (mode === "protected") {
          await until(() => completed === 1);
          assert.equal(logs.length, 0);
        } else {
          await until(() => logs.some((x) => x[0] === "[gtm-workflow]"));
          const details = logs.find(
            (x) => x[0] === "[gtm-workflow]",
          )?.[1] as any;
          assert.equal(details.layer, "local_queue_transport");
          assert.match(details.requestId, /^msg_/);
          assert.equal(
            details.causes[0].code,
            mode === "headers"
              ? "UND_ERR_HEADERS_TIMEOUT"
              : "UND_ERR_BODY_TIMEOUT",
          );
        }
        assert.equal(requests, 1, "stop fixture before SDK redelivery");
      });
    } finally {
      await queue.close();
      await close(server);
    }
  }
});

test("real MCP tool errors remain distinct from connection failures", async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "GET") {
      res.writeHead(405).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    let result: unknown;
    if (message.method === "initialize")
      result = {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      };
    else if (message.method === "tools/list")
      result = {
        tools: [{ name: "fixture_lookup", inputSchema: { type: "object" } }],
      };
    else {
      if (message.method === "tools/call") calls++;
      result = {
        isError: true,
        content: [{ type: "text", text: "provider rejected fixture" }],
      };
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
  });
  const url = await listen(server);
  try {
    const result = (await callMcpTool({ url }, "fixture_lookup", {})) as any;
    assert.equal(result.isError, true);
    assert.equal(result.diagnostic.layer, "mcp_tool");
    assert.equal(result.diagnostic.provider, "127.0.0.1");
    assert.equal(calls, 1);
  } finally {
    await close(server);
  }
  await assert.rejects(
    () => callMcpTool({ url }, "fixture_lookup", {}),
    (error) => {
      const details = JSON.parse((error as Error).message);
      assert.equal(details.layer, "mcp_transport");
      assert.equal(details.operation, "connect");
      return true;
    },
  );
});

test("CLI fixtures distinguish launch, exit, tool result, timeout, and malformed output without exposing stderr", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gtm-cli-fixture-"));
  const originalPath = process.env.PATH;
  process.env.PATH = dir;
  const options = {
    backend: "claude" as const,
    instructions: "fixture",
    prompt: "fixture",
    timeoutMs: 2000,
  };
  const check = async (layer: string, code?: number | string) =>
    assert.rejects(
      () => runAgentCli(options),
      (error) => {
        const text = (error as Error).message,
          details = JSON.parse(text);
        assert.equal(details.layer, layer);
        if (typeof code === "number") assert.equal(details.exitCode, code);
        if (typeof code === "string")
          assert.ok(details.causes.some((c: any) => c.code === code));
        assert.ok(!text.includes("secret-fixture"));
        return true;
      },
    );
  const binary = async (body: string) =>
    writeFile(join(dir, "claude"), `#!${process.execPath}\n${body}\n`, {
      mode: 0o755,
    });
  try {
    await check("cli_launch", "ENOENT");
    await binary(
      'process.stderr.write("Authorization: Bearer secret-fixture"); process.exit(7);',
    );
    await check("cli_exit", 7);
    await binary(
      'console.log(JSON.stringify({is_error:true,result:"secret-fixture"}));',
    );
    await check("cli_result");
    await binary('console.log("invalid secret-fixture");');
    await check("cli_result");
    options.timeoutMs = 50;
    await binary('process.on("SIGTERM",()=>{}); setInterval(()=>{},100);');
    const started = Date.now();
    await check("cli_timeout");
    assert.ok(Date.now() - started < 1500);
  } finally {
    process.env.PATH = originalPath;
    await rm(dir, { recursive: true, force: true });
  }
});

test("provider transport evidence keeps reservations and request context, never sends a duplicate paid call", async () => {
  await testDatabase();
  const client = Object.assign(db(), { close() {} });
  const lease = { id: "wrun_fixture", owner: "fixture" };
  await beginRun(client, {
    ...lease,
    workflowId: "fixture",
    budgetUsd: 10,
    input: [],
    omitted: 0,
  });
  let requests = 0;
  const server = createServer((req, res) => {
    requests++;
    req.resume();
    req.socket.destroy();
  });
  const url = await listen(server);
  const fetcher: typeof fetch = async (input, init) =>
    String(input).endsWith("/inspect")
      ? Response.json({
          price: { type: "PER_CALL", amount: { currency: "USD", value: 1 } },
        })
      : fetch(url, init);
  const operation = {
    provider: "fixture-provider",
    endpoint: "/lookup",
    body: { email: "private@example.test" },
  };
  try {
    await capture(async (logs) => {
      const first = await startLookup(
        client,
        lease,
        "fixture-key",
        operation,
        "secret-fixture",
        fetcher,
      );
      assert.equal(first.state, "uncertain");
      const second = await startLookup(
        client,
        lease,
        "fixture-key",
        operation,
        "secret-fixture",
        fetcher,
      );
      assert.equal(second.state, "uncertain");
      assert.equal(requests, 1);
      const diagnostic = logs[0][1] as any;
      assert.equal(diagnostic.layer, "provider_transport");
      assert.equal(diagnostic.provider, "monid");
      assert.equal(diagnostic.operation, "fixture-provider:/lookup");
      assert.equal(diagnostic.runId, lease.id);
      assert.ok(diagnostic.causes.some((x: any) => x.code));
      assert.ok(!JSON.stringify(logs).includes("secret-fixture"));
      assert.ok(!JSON.stringify(logs).includes("private@example.test"));
      await pollLookup(
        client,
        "attempt",
        "job-fixture",
        "secret-fixture",
        async () => new Response("secret-fixture", { status: 503 }),
      );
      assert.equal((logs.at(-1)?.[1] as any).layer, "provider_response");
      assert.equal((logs.at(-1)?.[1] as any).requestId, "job-fixture");
    });
  } finally {
    client.close();
    await close(server);
  }
});

test("row failures persist actual fetch cause and workflow ID without copying request payloads", async () => {
  const server = createServer((req) => req.socket.destroy());
  const url = await listen(server);
  const saved: any[] = [];
  try {
    const result = await runRows({
      rows: [{ key: "fixture" }],
      table: "exampleScores" as any,
      maxRows: 1,
      maxSpendUsd: 1,
      estimateUsd: 0,
      freshForMs: 0,
      read: async () => [],
      save: async (_table, row) => {
        saved.push(row);
      },
      step: async () => {
        await fetch(url);
        return { costUsd: 0 };
      },
    });
    assert.equal(result.failed, 1);
    const diagnostic = JSON.parse(saved[0].error);
    assert.equal(diagnostic.layer, "step");
    assert.equal(diagnostic.runId, "wrun_fixture");
    assert.ok(diagnostic.causes.some((c: any) => c.code === "UND_ERR_SOCKET"));
  } finally {
    await close(server);
  }
  const circular: any = {
    name: "Error",
    code: "ECONNRESET",
    message: "secret-fixture",
  };
  circular.cause = circular;
  assert.equal(failureDetails(circular, { layer: "step" }).causes.length, 1);
  assert.ok(!rowFailure(circular).includes("secret-fixture"));
});

test("two answers to one approval at once: exactly one wins, and the record says what the run was told", async () => {
  await testDatabase();
  const { resumed, goneHooks } = await import("./reliability-fixture");
  const { decideApproval } = await import("../templates/lib/approval-api");
  const { upsert } = await import("../templates/lib/db");
  const request = (token: string) => upsert("cache", [{ name: "approval", hash: token, created_at: new Date(), expires_at: new Date(Date.now() + 60_000),
    value: { token, runId: "run-a", stage: "s", tool: "t", input: {}, requestedAt: new Date().toISOString(), decidedAt: null, approved: null, reason: null } }], ["name", "hash"]);
  await request("tok");
  const outcomes = await Promise.allSettled([decideApproval("run-a", "tok", true, null), decideApproval("run-a", "tok", false, "no")]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  const winner = (outcomes.find((o) => o.status === "fulfilled") as PromiseFulfilledResult<{ approved: boolean }>).value;
  assert.deepEqual(resumed.filter((r) => r.token === "tok").map((r) => (r.payload as { approved: boolean }).approved), [winner.approved]);
  const [row] = (await db().execute("SELECT value FROM gtm.cache WHERE name = 'approval' AND hash = 'tok'")).rows as { value: { approved: boolean } }[];
  assert.equal(row.value.approved, winner.approved);
  await assert.rejects(decideApproval("run-b", "tok", true, null), /No approval tok on run run-b/);
  // A run that can no longer hear the answer: the claim is undone, so the request is still pending.
  await request("gone"); goneHooks.add("gone");
  await assert.rejects(decideApproval("run-a", "gone", true, null), /hook not found/);
  const [pending] = (await db().execute("SELECT value FROM gtm.cache WHERE name = 'approval' AND hash = 'gone'")).rows as { value: { decidedAt: string | null } }[];
  assert.equal(pending.value.decidedAt, null);
});

test("two deliveries of one webhook event at once start one run; a failed start lets the retry through", async () => {
  await testDatabase();
  const { admit, markStarted, releaseEvent } = await import("../templates/lib/intake-api");
  const { createHmac } = await import("node:crypto");
  process.env.TEST_INTAKE_SECRET = "s";
  const intake = { secretEnv: "TEST_INTAKE_SECRET", signature: { header: "x-sig" }, eventId: (e: { id: string }) => e.id, toRow: (e: { id: string }) => ({ key: e.id }) };
  const body = JSON.stringify({ id: "evt-1" });
  const headers = new Headers({ "x-sig": createHmac("sha256", "s").update(body).digest("hex") });
  const deliver = () => admit("hook", intake as never, body, headers);
  const [a, b] = await Promise.all([deliver(), deliver()]);
  assert.deepEqual([a, b].map((r) => r.reply.status).sort(), [200, 202]);
  const admitted = (a.row ? a : b).eventId!;
  await releaseEvent(admitted);
  const retry = await deliver();
  assert.equal(retry.reply.status, 202, "the start failed and released the event, so a redelivery starts it");
  await markStarted(retry.eventId!, "run-1");
  await releaseEvent(retry.eventId!);
  assert.deepEqual((await deliver()).reply.body, { duplicate: true }, "a started event stays seen");
});
