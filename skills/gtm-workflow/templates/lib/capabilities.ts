// gtm-lib v19
import { z } from "zod";

const dollars = z.number().finite().nonnegative();
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const schema = z.record(z.string(), z.unknown());
const auth = z.object({
  environmentVariable: z.string().regex(/^[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET)$/),
  header: z.string().regex(/^[a-zA-Z0-9-]+$/).default("Authorization"),
  prefix: z.enum(["Bearer ", ""]).default("Bearer "),
}).strict();
const endpoint = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
}, "Use a fixed HTTPS endpoint without credentials, query, or fragment");

export const toolDefinition = z.object({
  name,
  description: z.string().min(3).max(2000),
  inputSchema: schema,
  outputSchema: schema,
  /** Match decoded MCP error data that represents an expected read outcome. */
  recoverableErrorSchema: schema.optional(),
  effect: z.enum(["read", "write"]),
  costUsd: dollars,
  costKind: z.enum(["upper-bound", "estimate"]),
  maxCalls: z.number().int().positive().max(1000),
  timeoutMs: z.number().int().positive().max(300000),
  maxOutputBytes: z.number().int().positive().max(1000000),
  transport: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("mcp"), url: endpoint, tool: name, auth: auth.optional() }).strict(),
    z.object({ kind: z.literal("http"), url: endpoint, method: z.enum(["GET", "POST"]), auth: auth.optional() }).strict(),
  ]),
  /** Exact arguments enforced outside the model, e.g. Monid operation and Slack channel. */
  fixedArguments: z.record(z.string(), z.unknown()).default({}),
}).strict().superRefine((value, ctx) => {
  if (value.recoverableErrorSchema && (value.effect !== "read" || value.transport.kind !== "mcp")) {
    ctx.addIssue({ code: "custom", path: ["recoverableErrorSchema"], message: "Only read-only MCP tools may recover expected result errors" });
  }
});

export const agentDefinition = z.object({
  id: name,
  label: z.string().min(3).max(80),
  revision: z.string().min(1).max(128),
  model: z.string().min(1),
  instructions: z.string().min(1),
  outputSchema: schema,
  skills: z.array(z.object({
    name, description: z.string().min(1), revision: z.string().min(1),
    content: z.string().min(1).max(100000),
  }).strict()).default([]),
  tools: z.array(toolDefinition).default([]),
  maxModelCalls: z.number().int().positive().max(100),
  maxToolCalls: z.number().int().nonnegative().max(1000),
  maxOutputTokens: z.number().int().positive(),
  modelCallCostUsd: dollars,
  modelCostKind: z.enum(["upper-bound", "estimate"]),
  maxSpendUsd: dollars,
  timeoutMs: z.number().int().positive().max(3600000),
}).strict().superRefine((value, ctx) => {
  for (const field of ["tools", "skills"] as const) {
    const names = value[field].map((item) => item.name);
    if (new Set(names).size !== names.length || names.includes("loadSkill")) {
      ctx.addIssue({ code: "custom", path: [field], message: "Names must be unique; loadSkill is reserved" });
    }
  }
});

export type AgentDefinition = z.infer<typeof agentDefinition>;
export type ToolDefinition = z.infer<typeof toolDefinition>;

/** Safe to run during authoring. Does not resolve secrets, connect tools, or invoke models. */
export function describeCapabilities(definitions: unknown) {
  const agents = z.array(agentDefinition).parse(definitions);
  if (new Set(agents.map((agent) => agent.id)).size !== agents.length) {
    throw new Error("Agent stage ids must be unique");
  }
  return agents.map((agent) => ({
    id: agent.id, label: agent.label, revision: agent.revision, model: agent.model,
    skills: agent.skills.map(({ name, revision }) => ({ name, revision })),
    tools: agent.tools.map(({ name, effect, costKind, costUsd, maxCalls, transport, fixedArguments, recoverableErrorSchema }) => ({
      name, effect, costKind, costUsd, maxCalls, destination: transport.url, fixedArguments,
      ...(recoverableErrorSchema ? { recoverableErrorSchema } : {}),
    })),
    maxModelCalls: agent.maxModelCalls, maxToolCalls: agent.maxToolCalls,
    maxSpendUsd: agent.maxSpendUsd, timeoutMs: agent.timeoutMs,
    costIsEstimate: agent.modelCostKind === "estimate" || agent.tools.some((tool) => tool.costKind === "estimate"),
    execution: "durable-agent" as const,
  }));
}
