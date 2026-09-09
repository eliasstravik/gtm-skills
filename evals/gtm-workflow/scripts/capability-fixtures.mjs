export const agentWorkflow = `/**
 * Research fixture leads with selected skills and MCP.
 * Runs: on this computer
 * Kind: on-demand
 * Result table: accounts | key: fixture account id
 */
import { z } from "zod";
import { durableAgent } from "../lib/durable-agent";
import type { AgentDefinition } from "../lib/capabilities";
import type { WorkflowMeta } from "../lib/approve";
import { runRows } from "../lib/rows";
import { upsertRows } from "../lib/db";
import { accounts } from "../db/tables/accounts";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), domain: z.string() })) });
export const MAX_ROWS = 2, MAX_SPEND_USD = 1, COST_PER_ROW_USD = 0.1;
export const AGENTS: AgentDefinition[] = [{
  id: "research", label: "Research the lead", revision: "fixture-v1", model: "fixture/research",
  instructions: "Read the research skill, look up the lead, then produce a score with evidence.",
  outputSchema: { type: "object", properties: { score: { type: "integer" }, reason: { type: "string" } }, required: ["score", "reason"], additionalProperties: false },
  skills: [{ name: "research", description: "Evidence method", revision: "1", content: "Base the score on the supplied evidence." }],
  tools: [{ name: "lookup", description: "Look up the lead", inputSchema: { type: "object", properties: { domain: { type: "string" }, operation: { const: "company" } }, required: ["domain"], additionalProperties: false },
    outputSchema: { type: "object", required: ["content"] }, effect: "read", costUsd: 0.02, costKind: "upper-bound", maxCalls: 1,
    timeoutMs: 5000, maxOutputBytes: 5000, transport: { kind: "mcp", url: "https://fixture-mcp.test/mcp", tool: "lookup" }, fixedArguments: { operation: "company" } }],
  maxModelCalls: 3, maxToolCalls: 1, maxOutputTokens: 500, modelCallCostUsd: 0.02,
  modelCostKind: "estimate", maxSpendUsd: 1, timeoutMs: 30000,
}];
async function researchLead(row: z.infer<typeof input>["rows"][number], meta: WorkflowMeta, signal: AbortSignal) {
  const result = await durableAgent(AGENTS[0], row, meta, { signal });
  return { key: row.key, value: { company: row.domain, ...z.object({ score: z.number().int(), reason: z.string() }).parse(result) } };
}
/** Save the researched lead */
async function saveLead(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]);
}
export async function agentProof(arg: z.infer<typeof input>, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveLead },
    rowStep: researchLead, caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}
`;

// Injected only into the fixture server. All external model and MCP requests stay in process.
export const preload = `
import { appendFileSync } from "node:fs";
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return original(input, init);
  if (!["ai-gateway.vercel.sh", "fixture-mcp.test"].includes(url.hostname)) throw new Error("Fixture refused external network: " + url.hostname);
  const raw = input instanceof Request ? await input.text() : init?.body;
  const body = raw ? JSON.parse(raw) : {};
  if (url.hostname === "fixture-mcp.test") {
    if (body.method === "initialize") return Response.json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } } });
    if (body.method === "tools/call") {
      if (body.params.arguments.operation !== "company") throw new Error("Fixture observed unbound operation");
      appendFileSync(process.env.GTM_FIXTURE_CALLS, "mcp\\n");
      if (body.params.arguments.domain === "error.test") return Response.json({ jsonrpc: "2.0", id: body.id,
        result: { isError: true, content: [{ type: "text", text: "Uncertain provider result" }] } });
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "Company fits the accepted criteria" }] } });
    }
    return new Response(null, { status: 204 });
  }
  appendFileSync(process.env.GTM_FIXTURE_CALLS, "model\\n");
  const turns = body.prompt.filter((message) => message.role === "assistant").length;
  const userMessage = body.prompt.find((message) => message.role === "user");
  const domain = JSON.parse(userMessage.content[0].text).domain;
  const parts = [{ type: "stream-start", warnings: [] }];
  if (turns === 0) parts.push({ type: "tool-call", toolCallId: "skill-1", toolName: "loadSkill", input: JSON.stringify({ name: "research" }) });
  else if (turns === 1) parts.push({ type: "tool-call", toolCallId: "lookup-1", toolName: "lookup", input: JSON.stringify({ domain }) });
  else parts.push({ type: "text-start", id: "text" }, { type: "text-delta", id: "text", delta: JSON.stringify({ score: 91, reason: "Fixture evidence" }) }, { type: "text-end", id: "text" });
  parts.push({ type: "finish", finishReason: { unified: turns < 2 ? "tool-calls" : "stop", raw: "stop" },
    usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 10, text: 10 } }, providerMetadata: { gateway: { cost: "0.005" } } });
  return new Response(parts.map((part) => "data: " + JSON.stringify(part) + "\\n\\n").join(""), { headers: { "content-type": "text/event-stream" } });
};
`;

export const events = `import { z } from "zod";
import type { EventDefinition } from "../lib/events";
const schema = z.object({ id: z.string(), domain: z.string() });
export const eventSources: Record<string, EventDefinition> = {
  booking: { enabled: true, workflowPath: "agent-proof", secretEnv: "FIXTURE_EVENT_SECRET", signatureHeader: "x-cal-signature-256",
    maxBodyBytes: 1000, maxEventsPerDay: 1, maxSpendUsd: 1,
    parse(body) { const value = schema.parse(body); return { id: value.id, input: { rows: [{ key: value.id, domain: value.domain }] } }; } },
};
`;
