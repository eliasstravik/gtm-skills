import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { reserveAgentCall, settleAgentCall } from "./lib/agent-ledger";
import { bindToolArguments, sanitizeToolOutput } from "./lib/agent-tools";
import { agentDefinition, describeCapabilities } from "./lib/capabilities";
import { receiveEvent, verifyEventSignature } from "./lib/events";
import { getDb } from "./lib/db";
import { workflowRuns } from "./lib/schema";
import { AGENTS } from "./workflows/agent-proof";
import { provider } from "./lib/provider";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { scheduleWindow } from "./lib/schedule";

test("subdaily schedule windows admit later runs on the same day", () => {
  const first = Date.parse("2026-09-09T09:01:00Z");
  assert.equal(scheduleWindow(first, null), "2026-09-09");
  assert.equal(scheduleWindow(first, "60"), "2026-09-09T09:00Z");
  assert.equal(scheduleWindow(first + 30000, "60"), scheduleWindow(first, "60"));
  assert.notEqual(scheduleWindow(first + 3600000, "60"), scheduleWindow(first, "60"));
  assert.throws(() => scheduleWindow(first, "0"));
  assert.throws(() => scheduleWindow(first, "7"));
});

test("concurrent reservations cannot share the same remaining budget", async () => {
  const call = { meta: { runKey: "reservation-proof", slug: "proof", step: "research" },
    provider: "agent-tool", endpoint: "lookup", costUsd: 0.4, costKind: "upper-bound" as const,
    maxSpendUsd: 1, maxCalls: 10, maxToolCalls: 10 };
  const attempts = await Promise.allSettled(["a", "b", "c"].map((operation) => reserveAgentCall({ ...call, operation })));
  const admitted = attempts.filter((result) => result.status === "fulfilled");
  assert.equal(admitted.length, 2);
  await assert.rejects(reserveAgentCall({ ...call, operation: "d" }), /refused/);
  await settleAgentCall(admitted[0].value, 0.1);
  const next = await reserveAgentCall({ ...call, operation: "d" });
  assert.ok(next);
  await assert.rejects(reserveAgentCall({ ...call, operation: "d", costUsd: 0 }), /refused/);
});

test("classic provider admission shares the budget without double accounting", async () => {
  let calls = 0;
  const request = { name: "fixture", endpoint: "admitted-lookup", input: { id: "one" },
    schema: z.object({ ok: z.boolean() }), ttlMs: 60000, costUsd: 0.1,
    call: async () => { calls++; return { ok: true }; },
    meta: { runKey: "provider-admission", slug: "proof", step: "lookup" },
    admission: { operation: "lookup:one", maxSpendUsd: 0.1, maxCalls: 1 } };
  assert.equal((await provider(request)).status, "success");
  assert.equal((await provider(request)).status, "cache_hit");
  assert.equal(calls, 1);
  const rows = await (await getDb()).all(sql`SELECT count(*) AS count, sum(cost_usd) AS cost FROM enrichment_runs WHERE run_key = 'provider-admission'`);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].cost, 0.1);
  await assert.rejects(provider({ ...request, input: { id: "two" }, admission: { ...request.admission, operation: "lookup:two" } }), /refused/);
  assert.equal(calls, 1);
});

test("call counts and cancellation stop even zero-cost operations", async () => {
  const meta = { runKey: "count-proof", slug: "proof", step: "research" };
  const call = { meta, provider: "agent-tool", endpoint: "lookup", costUsd: 0,
    costKind: "estimate" as const, maxSpendUsd: 1, maxCalls: 10, maxToolCalls: 1 };
  await reserveAgentCall({ ...call, operation: "a" });
  await assert.rejects(reserveAgentCall({ ...call, endpoint: "other", operation: "b" }), /refused/);
  const db = await getDb();
  await db.insert(workflowRuns).values({ runKey: "cancel-proof", workflow: "proof", path: "proof", method: "POST",
    input: "{}", inputHash: "cancel-proof", status: "cancelling", cancelRequestedAt: Date.now(), startedAt: Date.now() });
  await assert.rejects(reserveAgentCall({ ...call, meta: { ...meta, runKey: "cancel-proof" }, operation: "a" }), /refused/);
  await assert.rejects(reserveAgentCall({ ...call, operation: "bad", maxSpendUsd: NaN }), /Invalid/);
});

test("tool schema and fixed arguments enforce operation scope", () => {
  const spec = agentDefinition.parse(AGENTS[0]);
  const tool = spec.tools[0];
  assert.deepEqual(bindToolArguments(tool, { domain: "lead.test" }), { domain: "lead.test", operation: "company" });
  assert.throws(() => bindToolArguments(tool, { domain: "lead.test", operation: "send-email" }), /accepted scope/);
  assert.throws(() => bindToolArguments(tool, { domain: "lead.test", destination: "elsewhere" }), /committed schema/);
  assert.throws(() => agentDefinition.parse({ ...spec, tools: [tool, tool] }), /unique/);
  assert.throws(() => agentDefinition.parse({ ...spec, tools: [{ ...tool, transport: { kind: "http", method: "POST", url: "https://user:password@example.test" } }] }));
  assert.equal(describeCapabilities([spec])[0].costIsEstimate, true);
  process.env.FIXTURE_TOOL_TOKEN = "fixture-value-to-redact";
  assert.deepEqual(sanitizeToolOutput({ text: "echo fixture-value-to-redact", nested: { authorization: "anything" } }),
    { text: "echo [REDACTED]", nested: { authorization: "[REDACTED]" } });
});

test("signed intake rejects malformed and oversized requests before persistence", async () => {
  const secret = "fixture-event-secret";
  process.env.UNIT_EVENT_SECRET = secret;
  const raw = new TextEncoder().encode('{"id":"one"}');
  const signature = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyEventSignature(raw, signature, secret), true);
  assert.equal(verifyEventSignature(raw, signature + "00", secret), false);
  assert.equal(verifyEventSignature(new TextEncoder().encode('{}'), signature, secret), false);
  const definition = { enabled: true, workflowPath: "proof", secretEnv: "UNIT_EVENT_SECRET",
    signatureHeader: "x-signature", maxBodyBytes: 30, maxEventsPerDay: 1, maxSpendUsd: 1,
    parse() { throw new Error("fixture malformed schema"); } };
  const request = (body: string, signature?: string) => new Request("https://fixture.test", {
    method: "POST", body, headers: signature ? { "x-signature": signature } : {},
  });
  assert.equal((await receiveEvent(request('{}'), "fixture", { ...definition, enabled: false })).status, 404);
  assert.equal((await receiveEvent(request('{}'), "fixture", definition)).status, 401);
  assert.equal((await receiveEvent(request('x'.repeat(100)), "fixture", definition)).status, 413);
  assert.equal((await receiveEvent(request(new TextDecoder().decode(raw), signature), "fixture", definition)).status, 400);
});
