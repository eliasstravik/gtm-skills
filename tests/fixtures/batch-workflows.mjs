export const table = `import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const accounts = sqliteTable("accounts", { key: text("key").primaryKey(), company: text("company"), updatedAt: integer("updated_at").notNull() });`;

export const rowsWorkflow = `/**
 * Look up fixture accounts.
 * Runs: on this computer
 * Kind: on-demand
 * Result table: accounts | key: account id
 * Concurrency: 4
 */
import { z } from "zod";
import { runRows } from "../lib/rows";
import { provider, ProviderAuthError } from "../lib/provider";
import type { WorkflowMeta } from "../lib/approve";
import { upsertRows } from "../lib/db";
import { accounts } from "../db/tables/accounts";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), fail: z.boolean().optional(), slow: z.boolean().optional(), hold: z.boolean().optional(), cost: z.number().optional() })) });
export const MAX_ROWS = 300, MAX_SPEND_USD = 2, COST_PER_ROW_USD = 0.01;
/** Look up the account */
async function lookupAccount(row: z.infer<typeof input>["rows"][number], meta: WorkflowMeta) {
  "use step";
  const result = await provider({ name: "fixture", endpoint: "lookup", input: row, meta, ttlMs: 0, costUsd: row.cost ?? 0.01,
    schema: z.object({ company: z.string() }), call: async () => {
      if (row.slow) await new Promise(resolve => setTimeout(resolve, 4000));
      if (row.fail) throw new Error("Fixture lookup failed");
      if (row.hold) throw new ProviderAuthError("Fixture unauthorized");
      return { company: row.key };
    } });
  return { key: row.key, value: result.value };
}
lookupAccount.maxRetries = 0;
/** Save the account */
async function saveAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]);
}
export async function parallelProof(arg: z.infer<typeof input>, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, concurrency: 4, table: { name: "accounts", save: saveAccount }, rowStep: lookupAccount,
    caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}`;

export function parentWorkflow(name = 'batchProof', timeoutMs = 120000, maxSpendUsd = 2) {
  return `/**
 * Process fixture accounts in child batches.
 * Runs: on this computer
 * Kind: on-demand
 * Result table: accounts | key: account id
 */
import { z } from "zod";
import { runBatches } from "../lib/batches";
import type { WorkflowMeta } from "../lib/approve";
export const input = z.object({ rows: z.array(z.object({ key: z.string(), fail: z.boolean().optional(), slow: z.boolean().optional(), hold: z.boolean().optional(), cost: z.number().optional() })) });
export const MAX_ROWS = 600, MAX_SPEND_USD = ${maxSpendUsd}, COST_PER_ROW_USD = 0.01;
export async function ${name}(arg: z.infer<typeof input>, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runBatches({ input: arg, meta, childWorkflow: "parallel-proof", batchSize: 4, timeoutMs: ${timeoutMs}, table: "accounts",
    caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}`;
}

export const agentWorkflow = `/**
 * Finish a fixture agent before its long deadline.
 * Runs: on this computer
 * Kind: on-demand
 * Result table: accounts | key: account id
 */
import { z } from "zod";
import { durableAgent } from "../lib/durable-agent";
import type { AgentDefinition } from "../lib/capabilities";
import type { WorkflowMeta } from "../lib/approve";
import { runRows } from "../lib/rows";
import { upsertRows } from "../lib/db";
import { accounts } from "../db/tables/accounts";
export const input = z.object({ rows: z.array(z.object({ key: z.string() })) });
export const MAX_ROWS = 2, MAX_SPEND_USD = 1, COST_PER_ROW_USD = 0.02;
export const AGENTS: AgentDefinition[] = [{ id: "proof", label: "Read the account", revision: "fixture-v1", model: "fixture/instant",
  instructions: "Return the fixture account.", outputSchema: { type: "object", properties: { company: { type: "string" } }, required: ["company"], additionalProperties: false },
  skills: [], tools: [], maxModelCalls: 1, maxToolCalls: 0, maxOutputTokens: 100, modelCallCostUsd: 0.02, modelCostKind: "estimate", maxSpendUsd: 1, timeoutMs: 600000 }];
async function readAccount(row: { key: string }, meta: WorkflowMeta, signal: AbortSignal) {
  const value = await durableAgent(AGENTS[0], row, meta, { signal });
  return { key: row.key, value: z.object({ company: z.string() }).parse(value) };
}
/** Save the agent result */
async function saveAgentAccount(row: Record<string, unknown>) {
  "use step";
  await upsertRows(accounts, [{ ...row, updatedAt: Date.now() }]);
}
export async function deadlineProof(arg: z.infer<typeof input>, meta: WorkflowMeta) {
  "use workflow";
  arg = input.parse(arg);
  return runRows({ rows: arg.rows, meta, table: { name: "accounts", save: saveAgentAccount }, rowStep: readAccount,
    caps: { maxRows: MAX_ROWS, maxSpendUsd: MAX_SPEND_USD, costPerRowUsd: COST_PER_ROW_USD } });
}`;

export const modelPreload = `const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return original(input, init);
  if (url.hostname !== "ai-gateway.vercel.sh") throw new Error("Fixture blocked external request: " + url.hostname);
  const raw = input instanceof Request ? await input.text() : init?.body;
  if (String(raw).includes("slow-model")) await new Promise(resolve => setTimeout(resolve, 2500));
  const parts = [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "text" },
    { type: "text-delta", id: "text", delta: JSON.stringify({ company: "Fixture account" }) }, { type: "text-end", id: "text" },
    { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: { inputTokens: { total: 5, noCache: 5 }, outputTokens: { total: 10, text: 10 } }, providerMetadata: { gateway: { cost: "0.005" } } }];
  return new Response(parts.map(part => "data: " + JSON.stringify(part) + "\\n\\n").join(""), { headers: { "content-type": "text/event-stream" } });
};`;

export const isolationWorkflow = agentWorkflow
  .replace(' * Kind: on-demand', ' * Kind: on-demand\n * Concurrency: 2')
  .replace('import { z }', 'import { sleep } from "workflow";\nimport { z }')
  .replaceAll('deadlineProof', 'deadlineIsolation').replaceAll('readAccount', 'readParallelAccount').replaceAll('saveAgentAccount', 'saveParallelAgentAccount')
  .replace('const value = await durableAgent(AGENTS[0], row, meta, { signal });', 'const [value] = await Promise.all([durableAgent(AGENTS[0], row, meta, { signal }), sleep("2s")]);')
  .replace('return runRows({ rows:', 'return runRows({ concurrency: 2, rows:');

export const expiryWorkflow = agentWorkflow.replaceAll('deadlineProof', 'deadlineExpiry')
  .replaceAll('readAccount', 'readExpiringAccount').replaceAll('saveAgentAccount', 'saveExpiringAgentAccount').replace('timeoutMs: 600000', 'timeoutMs: 500');
