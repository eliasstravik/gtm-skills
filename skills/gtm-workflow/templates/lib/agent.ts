import { WorkflowAgent } from "@ai-sdk/workflow";
import { jsonSchema, Output, stepCountIs, tool, type StepResult, type ToolSet } from "ai";
import { sleep } from "workflow";
import { z } from "zod";
import { skills } from "../skills";
import { callMcpTool, listMcpTools, type McpServer } from "./mcp";
import { fetchPage, webSearch } from "./web";

/**
 * Agent stage: a durable, tool-using agent inside a workflow, through AI Gateway.
 *
 * Call runAgent() from workflow scope, never inside a "use step" function. Every model call and every tool call
 * then runs as its own step: retried by the engine's rules, resumed after a crash, and visible in the run's trace.
 * The agent gets a model, reasoning effort, instructions, optional skills (text modules registered in skills/index.ts), and
 * tools (hosted MCP servers, web search and page fetch, or your own step-backed tools), and must return the schema.
 */

export type Reasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AgentTools = {
  /** Hosted MCP servers by name. Each tool call is a step; the key is read from the named variable on the workflow project. */
  mcp?: Record<string, McpServer>;
  /** Built-in web tools: `fetch` gives fetch_page (free, cached a day); `search` gives web_search through Exa (EXA_API_KEY). */
  web?: { search?: boolean; fetch?: boolean };
  /** Your own tools. Give each `execute` a "use step" function so the call is durable and appears in the trace. */
  custom?: ToolSet;
};

export type AgentOptions<T> = {
  /** Stable id, shown in the trace; use the stage function's name. */
  name: string;
  instructions: string;
  prompt: string;
  /** The result the agent must return. Use nullable fields, not optional ones, and no string formats. */
  schema: z.ZodType<T>;
  /** Charged when the Gateway reports no cost; the per-row estimate runRows uses for its caps. */
  estimateUsd: number;
  /** AI Gateway model id; defaults to GTM_MODEL on the project. */
  model?: string;
  /** Reasoning effort; defaults to GTM_REASONING on the project, else the provider's default. */
  reasoning?: Reasoning;
  /** Names from skills/index.ts, appended to the instructions. */
  skills?: string[];
  tools?: AgentTools;
  /** Model calls, tool turns included. Default 20. */
  maxSteps?: number;
  /** Soft budget: after the call that crosses it, the agent stops calling tools and writes up what it has. */
  maxUsd?: number;
  /** Wall-clock limit as a duration ("5m", "90s", "1h"). Default "10m". The row fails when it is reached. */
  timeout?: string | number;
  maxOutputTokens?: number;
};

export type AgentToolCall = { tool: string; input: unknown; ok: boolean; costUsd: number };

export type AgentResult<T> = {
  value: T;
  /** Gateway-reported model cost plus tool-reported cost; estimateUsd when the Gateway reported nothing. */
  costUsd: number;
  modelCalls: number;
  toolCalls: AgentToolCall[];
  stopReason: "done" | "maxSteps" | "maxUsd";
  usage: { inputTokens: number; outputTokens: number };
};

const WRAP_UP = "Stop using tools now. Return the requested structured result from what you have found so far; use null or empty lists for anything not established.";

/** Workflow scope. One row's agent stage: builds the tools, runs the loop, enforces the caps, returns the parsed schema. */
export async function runAgent<T>(o: AgentOptions<T>): Promise<AgentResult<T>> {
  const model = o.model ?? process.env.GTM_MODEL ?? "openai/gpt-5.6-luna";
  const reasoning = o.reasoning ?? (process.env.GTM_REASONING as Reasoning | undefined);
  const maxSteps = o.maxSteps ?? 20;
  const timeout = o.timeout ?? "10m";
  const method = (o.skills ?? []).map(readSkill);
  const tools = await buildTools(o.tools);
  const output = Output.object<T>({ schema: jsonSchema<T>(sanitizeSchema(z.toJSONSchema(o.schema)) as never) });
  const overBudget = (steps: StepResult<ToolSet>[]) => o.maxUsd != null && spentUsd(steps) >= o.maxUsd;

  const agent = new WorkflowAgent({
    id: o.name,
    model,
    instructions: [o.instructions, ...method].join("\n\n"),
    tools,
    maxRetries: 0,
    ...(reasoning && { reasoning }),
    ...(o.maxOutputTokens && { maxOutputTokens: o.maxOutputTokens }),
    stopWhen: [stepCountIs(maxSteps), ({ steps }) => overBudget(steps as StepResult<ToolSet>[])],
  });

  // Timeouts are a race against sleep(): AbortSignal.timeout() and timers do not exist in workflow scope.
  const controller = new AbortController();
  const timedOut = sleep(durationMs(timeout)).then(() => "timeout" as const);
  const first = await Promise.race([agent.stream({ prompt: o.prompt, output, abortSignal: controller.signal }), timedOut]);
  if (first === "timeout") {
    controller.abort();
    throw new Error(`Agent ${o.name} timed out after ${timeout}`);
  }

  let steps = first.steps as StepResult<ToolSet>[];
  let value = first.output as T | undefined;
  const stopReason: AgentResult<T>["stopReason"] = value != null ? "done" : overBudget(steps) ? "maxUsd" : "maxSteps";
  if (value == null) {
    // The loop ended on a cap in the middle of research: one last call, no tools, to write up what was found.
    // The instructions travel as the agent's own; a system message inside `messages` is rejected.
    const history = first.messages.filter((m) => m.role !== "system");
    const last = await Promise.race([
      agent.stream({ messages: [...history, { role: "user", content: WRAP_UP }], toolChoice: "none", output, abortSignal: controller.signal }),
      timedOut,
    ]);
    if (last === "timeout") {
      controller.abort();
      throw new Error(`Agent ${o.name} timed out after ${timeout}`);
    }
    steps = [...steps, ...(last.steps as StepResult<ToolSet>[])];
    value = last.output as T | undefined;
  }
  if (value == null) throw new Error(`Agent ${o.name} returned no structured result (${stopReason})`);

  const modelCost = gatewayUsd(steps);
  const toolCalls = traceToolCalls(steps);
  return {
    value: o.schema.parse(value),
    costUsd: round((modelCost > 0 ? modelCost : o.estimateUsd) + toolCalls.reduce((sum, c) => sum + c.costUsd, 0)),
    modelCalls: steps.length,
    toolCalls,
    stopReason,
    usage: {
      inputTokens: steps.reduce((n, s) => n + (s.usage?.inputTokens ?? 0), 0),
      outputTokens: steps.reduce((n, s) => n + (s.usage?.outputTokens ?? 0), 0),
    },
  };
}

/** Workflow scope: built-in and MCP tools become step-backed AI SDK tools; custom tools pass through. */
async function buildTools(t: AgentTools | undefined): Promise<ToolSet> {
  const tools: ToolSet = { ...(t?.custom ?? {}) };
  if (t?.web?.fetch) {
    tools.fetch_page = tool({
      description: "Fetch a public web page and return its readable text, up to about 8,000 characters.",
      inputSchema: z.object({ url: z.string() }),
      strict: false,
      execute: ({ url }) => fetchPage(url),
    });
  }
  if (t?.web?.search) {
    tools.web_search = tool({
      description: "Search the web. Returns up to 10 results with title, url, published date, and an excerpt.",
      inputSchema: z.object({ query: z.string(), numResults: z.number().int().min(1).max(10).nullable() }),
      strict: false,
      execute: ({ query, numResults }) => webSearch(query, numResults ?? 5),
    });
  }
  for (const [server, config] of Object.entries(t?.mcp ?? {})) {
    for (const def of await listMcpTools(config)) {
      if (config.allow && !config.allow.includes(def.name)) continue;
      const name = def.name.startsWith(`${server}_`) ? def.name : `${server}_${def.name}`;
      tools[name] = tool({
        description: def.description,
        inputSchema: jsonSchema<Record<string, unknown>>(sanitizeSchema(def.inputSchema) as never),
        strict: false,
        execute: (input, options) => {
          if (config.maxCalls != null && countCalls(options.messages, name) >= config.maxCalls) {
            throw new Error(`${name} has reached its limit of ${config.maxCalls} calls in this stage`);
          }
          return callMcpTool(config, def.name, input);
        },
      });
    }
  }
  return tools;
}

/** Workflow scope: skills are plain text modules registered in skills/index.ts. */
function readSkill(name: string): string {
  const text = skills[name];
  if (!text) throw new Error(`Unknown skill ${name}; add skills/${name}.ts and register it in skills/index.ts`);
  return text;
}

/** "90s", "5m", "1h", "2d", or a number of milliseconds. */
export function durationMs(value: string | number): number {
  if (typeof value === "number") return value;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)\s*$/i.exec(value);
  if (!m) throw new Error(`Not a duration: ${value}`);
  return Number(m[1]) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2].toLowerCase() as "ms" | "s" | "m" | "h" | "d"];
}

/** OpenAI's strict JSON schema rejects string formats and the $schema key; the model reads the description instead. */
export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "$schema" || k === "format") continue;
    out[k] = k === "properties" || k === "definitions" || k === "$defs" ? mapValues(v, sanitizeSchema) : sanitizeSchema(v);
  }
  return out;
}

function mapValues(v: unknown, f: (x: unknown) => unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, f(x)]));
}

/** The Gateway reports each call's cost in its provider metadata; summed across steps. */
function gatewayUsd(steps: StepResult<ToolSet>[]): number {
  return round(steps.reduce((sum, s) => {
    const cost = (s.providerMetadata?.gateway as { cost?: unknown } | undefined)?.cost;
    return sum + (typeof cost === "string" || typeof cost === "number" ? Number(cost) || 0 : 0);
  }, 0));
}

/** Tool results can report what they cost: { costUsd } from our own steps, or { cost: { value, currency: "USD" } } from a provider. */
function toolUsd(output: unknown): number {
  if (!output || typeof output !== "object") return 0;
  const r = output as { costUsd?: unknown; cost?: { value?: unknown; currency?: unknown } };
  if (typeof r.costUsd === "number") return r.costUsd;
  if (r.cost && typeof r.cost === "object" && r.cost.currency === "USD" && typeof r.cost.value === "number") return r.cost.value;
  return 0;
}

function spentUsd(steps: StepResult<ToolSet>[]): number {
  return gatewayUsd(steps) + steps.reduce((sum, s) => sum + (s.toolResults ?? []).reduce((t, r) => t + toolUsd(r.output), 0), 0);
}

function traceToolCalls(steps: StepResult<ToolSet>[]): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  for (const s of steps) {
    const results = new Map((s.toolResults ?? []).map((r) => [r.toolCallId, r]));
    for (const c of s.toolCalls ?? []) {
      const r = results.get(c.toolCallId);
      const ok = r != null && !(typeof r.output === "object" && r.output != null && "isError" in r.output && (r.output as { isError?: boolean }).isError);
      calls.push({ tool: c.toolName, input: c.input, ok, costUsd: round(toolUsd(r?.output)) });
    }
  }
  return calls;
}

function countCalls(messages: unknown, toolName: string): number {
  let n = 0;
  for (const m of Array.isArray(messages) ? messages : []) {
    const content = (m as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) if ((part as { type?: string; toolName?: string }).type === "tool-call" && (part as { toolName?: string }).toolName === toolName) n += 1;
  }
  return n;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
