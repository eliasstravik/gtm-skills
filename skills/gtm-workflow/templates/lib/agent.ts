import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";
import { WorkflowAgent, type ModelCallStreamPart, type WorkflowAgentOptions, type WorkflowAgentStreamOptions } from "@ai-sdk/workflow";
import { jsonSchema, Output, stepCountIs, tool, type ModelMessage, type StepResult, type ToolSet } from "ai";
import { getWorkflowMetadata, getWritable, sleep } from "workflow";
import { z } from "zod";
import { skills } from "../skills";
import { approvalHook, recordApproval } from "./approval";
import { runAgentCli, type CliBackend } from "./cli";
import { callMcpTool, listMcpTools, type McpServer } from "./mcp";
import { canNotify, notify, type SlackTarget } from "./notify";
import { fetchPage } from "./web";

/**
 * Agent stage: a durable, tool-using agent inside a workflow.
 *
 * Call runAgent() from workflow scope, never inside a "use step" function. Every model call and every tool call
 * then runs as its own step: retried by the engine's rules, resumed after a crash, and visible in the run's trace.
 * The backend is chosen per run from the environment: GTM_AGENT_BACKEND in .env on a personal computer puts the
 * stage on the author's Claude Code or Codex subscription; the hosted copy, where no such variable exists, runs it
 * through AI Gateway. The same workflow file runs in both places without edits.
 * The config is the whole authoring surface: model and reasoning, instructions and skills, tools (hosted MCP
 * servers, web search and page fetch, your own step-backed tools), human approval per tool, live streaming, caps on
 * steps, spend, and time, and the schema of the answer. Everything else WorkflowAgent accepts passes through `agent`
 * (constructor options) and `call` (per-call options); the helper keeps only the fields where mistakes break runs.
 */

export type Reasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

/** Where web_search runs: `gateway` is Exa executed by AI Gateway (any model, no key); `openai` is OpenAI's own web search (openai/* models only). Both run inside the model call, not as steps. */
export type SearchProviderName = "gateway" | "openai";

export type AgentTools = {
  /** Hosted MCP servers by name. Each tool call is a step; the key is read from the named variable on the workflow project. */
  mcp?: Record<string, McpServer>;
  /** Built-in web tools: `fetch` gives fetch_page (free, cached a day, a step); `search` gives web_search (`true` is `gateway`). */
  web?: { search?: boolean | SearchProviderName; fetch?: boolean };
  /** Your own tools. Give each `execute` a "use step" function so the call is durable and appears in the trace. */
  custom?: ToolSet;
};

type OwnedAgentKeys = "id" | "model" | "tools" | "instructions" | "system" | "output" | "abortSignal" | "maxRetries" | "reasoning" | "maxOutputTokens";
type OwnedCallKeys = "prompt" | "messages" | "output" | "abortSignal" | "timeout" | "writable" | "instructions" | "system" | "stopWhen";
/** WorkflowAgent constructor options the helper does not own: sampling, provider options, prepareStep, prepareCall, callbacks, telemetry, contexts. */
export type AgentPassthrough = Partial<Omit<WorkflowAgentOptions<ToolSet>, OwnedAgentKeys>>;
/** WorkflowAgent per-call options the helper does not own: toolChoice, activeTools, callbacks, transforms. */
export type CallPassthrough = Partial<Omit<Extract<WorkflowAgentStreamOptions<ToolSet>, { prompt: unknown }>, OwnedCallKeys>>;

export type AgentOptions<T = string> = {
  /** Stable id, shown in the trace and in approval requests; use the stage function's name. */
  name: string;
  /**
   * Overrides GTM_AGENT_BACKEND for this stage. gateway: AI Gateway, every model and tool call a step, works hosted.
   * claude or codex: the whole agent runs inside one step through that CLI on the author's subscription, this machine
   * only; MCP servers and web tools carry over. A stage that uses custom tools, approve, stream, or messages, and every
   * stage on the hosted copy, runs on the Gateway whatever this says.
   */
  backend?: "gateway" | CliBackend;
  instructions: string;
  /** The task. Give `messages` instead to continue a conversation. */
  prompt?: string;
  messages?: ModelMessage[];
  /** The result the agent must return; plain text when omitted. Use nullable fields, not optional ones, and no string formats. */
  schema?: z.ZodType<T>;
  /** Charged when the Gateway reports no cost; the per-row estimate runRows uses for its caps. */
  estimateUsd: number;
  /** AI Gateway model id; defaults to GTM_MODEL on the project. */
  model?: string;
  /** Reasoning effort; defaults to GTM_REASONING on the project, else the provider's default. */
  reasoning?: Reasoning;
  /** Names from skills/index.ts, appended to the instructions. */
  skills?: string[];
  tools?: AgentTools;
  /** Tool names a person must approve before each call (web_search, monid_run, or a custom tool's name); the row waits, then continues. */
  approve?: string[];
  /** Where approval requests are posted: a Slack channel, and a thread when the run was started from one. `false` keeps them silent; the read route still lists them. Set in code per stage, usually from a constant at the top of the workflow or from `input.notify`. */
  notify?: SlackTarget | false;
  /** Write every model and tool event to the run's stream; read it at GET /api/runs/<id>/stream. */
  stream?: boolean;
  /** Model calls, tool turns included. Default 20. */
  maxSteps?: number;
  /** Soft budget: after the call that crosses it, the agent stops calling tools and writes up what it has. */
  maxUsd?: number;
  /** Wall-clock limit as a duration ("5m", "90s", "2d"). Default "10m"; make it days when approvals may wait. The row fails when it is reached. */
  timeout?: string | number;
  maxOutputTokens?: number;
  /** Anything else WorkflowAgent's constructor takes. */
  agent?: AgentPassthrough;
  /** Anything else WorkflowAgent's stream() takes; applied to the wrap-up call too. */
  call?: CallPassthrough;
};

export type AgentToolCall = { tool: string; input: unknown; ok: boolean; costUsd: number };

export type AgentResult<T = string> = {
  value: T;
  /** Gateway-reported model cost plus tool-reported cost; estimateUsd when the Gateway reported nothing. */
  costUsd: number;
  modelCalls: number;
  toolCalls: AgentToolCall[];
  stopReason: "done" | "maxSteps" | "maxUsd";
  usage: { inputTokens: number; outputTokens: number };
};

const WRAP_UP = "Stop using tools now. Return the requested result from what you have found so far; use null or empty lists for anything not established.";

/** Workflow scope. One row's agent stage: builds the tools, runs the loop, enforces the caps, returns the parsed result. */
export async function runAgent<T = string>(o: AgentOptions<T>): Promise<AgentResult<T>> {
  if ((o.prompt == null) === (o.messages == null)) throw new Error(`Agent ${o.name}: give exactly one of prompt or messages`);
  const reasoning = o.reasoning ?? (process.env.GTM_REASONING as Reasoning | undefined);
  const maxSteps = o.maxSteps ?? 20;
  const timeout = o.timeout ?? "10m";
  const method = (o.skills ?? []).map(readSkill);
  const backend = chooseBackend(o);
  if (backend !== "gateway") return runOnCli(o, backend, [o.instructions, ...method].join("\n\n"), reasoning, durationMs(timeout));
  const model = o.model ?? process.env.GTM_MODEL ?? "openai/gpt-5.6-luna";
  const tools = guardTools(o.name, await buildTools(o.tools, model), o.approve ?? [], o.notify);
  const output = o.schema ? Output.object<T>({ schema: jsonSchema<T>(sanitizeSchema(z.toJSONSchema(o.schema)) as never) }) : (Output.text() as unknown as ReturnType<typeof Output.object<T>>);
  const overBudget = (steps: StepResult<ToolSet>[]) => o.maxUsd != null && spentUsd(steps) >= o.maxUsd;
  const userStops = o.agent?.stopWhen == null ? [] : Array.isArray(o.agent.stopWhen) ? o.agent.stopWhen : [o.agent.stopWhen];

  const agent = new WorkflowAgent({
    ...o.agent,
    id: o.name,
    model,
    instructions: [o.instructions, ...method].join("\n\n"),
    tools,
    maxRetries: 0,
    ...(reasoning && { reasoning }),
    ...(o.maxOutputTokens && { maxOutputTokens: o.maxOutputTokens }),
    stopWhen: [...userStops, stepCountIs(maxSteps), ({ steps }) => overBudget(steps as StepResult<ToolSet>[])],
  });

  // Timeouts are a race against sleep(): AbortSignal.timeout() and timers do not exist in workflow scope.
  const controller = new AbortController();
  const timedOut = sleep(durationMs(timeout)).then(() => "timeout" as const);
  const shared = { ...o.call, output, abortSignal: controller.signal, ...(o.stream && { writable: getWritable<ModelCallStreamPart>(), preventClose: true, sendFinish: false }) };
  const task = o.messages ? { messages: o.messages } : { prompt: o.prompt as string };
  const first = await Promise.race([agent.stream({ ...shared, ...task } as never), timedOut]);
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
    const last = await Promise.race([agent.stream({ ...shared, messages: [...history, { role: "user", content: WRAP_UP }], toolChoice: "none" } as never), timedOut]);
    if (last === "timeout") {
      controller.abort();
      throw new Error(`Agent ${o.name} timed out after ${timeout}`);
    }
    steps = [...steps, ...(last.steps as StepResult<ToolSet>[])];
    value = last.output as T | undefined;
  }
  if (value == null) throw new Error(`Agent ${o.name} returned no result (${stopReason})`);

  const modelCost = gatewayUsd(steps);
  const toolCalls = traceToolCalls(steps);
  return {
    value: o.schema ? o.schema.parse(value) : value,
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

/**
 * Workflow scope, from the frozen environment: the stage's own `backend`, else GTM_AGENT_BACKEND, else the Gateway.
 * A CLI backend cannot do custom tools, approvals, streaming, or conversations, and does not exist on Vercel, so those
 * stages take the Gateway instead of failing.
 */
function chooseBackend(o: AgentOptions<unknown>): "gateway" | CliBackend {
  const wanted = o.backend ?? (process.env.GTM_AGENT_BACKEND as "gateway" | CliBackend | undefined) ?? "gateway";
  if (wanted !== "claude" && wanted !== "codex") return "gateway";
  const needsGateway = process.env.VERCEL || o.tools?.custom || o.approve?.length || o.stream || o.messages || o.agent || o.call;
  return needsGateway ? "gateway" : wanted;
}

/** Workflow scope: built-in and MCP tools become step-backed AI SDK tools; web search is a provider-executed tool; custom tools pass through. */
async function buildTools(t: AgentTools | undefined, model: string): Promise<ToolSet> {
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
    const provider: SearchProviderName = t.web.search === true ? "gateway" : t.web.search;
    if (provider === "openai" && !model.startsWith("openai/")) throw new Error(`web search through openai needs an openai/* model, not ${model}`);
    // Executed by the Gateway or the provider inside the model call: no step of its own, its cost inside the call's cost.
    tools.web_search = provider === "openai" ? openai.tools.webSearch({}) : gateway.tools.exaSearch();
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

/** Workflow scope: a guarded tool records the request, waits on a hook keyed by its tool call id, then runs or reports the denial. */
function guardTools(stage: string, tools: ToolSet, approve: string[], target: SlackTarget | false | undefined): ToolSet {
  for (const name of approve) {
    if (!tools[name]) throw new Error(`Agent ${stage}: approve names unknown tool ${name}`);
    if (!tools[name].execute) throw new Error(`Agent ${stage}: ${name} runs on the provider and cannot wait for approval`);
  }
  const guarded: ToolSet = { ...tools };
  for (const name of approve) {
    const original = tools[name];
    guarded[name] = {
      ...original,
      execute: async (input: unknown, options: { toolCallId: string; messages: ModelMessage[] }) => {
        const token = `approval:${options.toolCallId}`;
        const hook = approvalHook.create({ token });
        await recordApproval({ token, runId: getWorkflowMetadata().workflowRunId, stage, tool: name, input });
        // A person hears about it in Slack at the stage's target (or the agent's default channel); otherwise the run's read route lists it.
        if (target !== false && canNotify()) await notify({ kind: "ask", text: `${stage} wants to call ${name} with ${JSON.stringify(input).slice(0, 600)}`, approval: { token }, target: target || undefined });
        const decision = await hook;
        if (!decision.approved) return { isError: true, tool: name, error: `A person declined this call${decision.reason ? `: ${decision.reason}` : ""}` };
        return original.execute?.(input as never, options as never);
      },
    } as ToolSet[string];
  }
  return guarded;
}

/** Workflow scope: the CLI backends, one step each; chooseBackend has already routed anything they cannot do to the Gateway. */
async function runOnCli<T>(o: AgentOptions<T>, backend: CliBackend, instructions: string, reasoning: Reasoning | undefined, timeoutMs: number): Promise<AgentResult<T>> {
  const r = await runAgentCli({
    backend,
    instructions,
    prompt: o.prompt as string,
    schema: o.schema ? (sanitizeSchema(z.toJSONSchema(o.schema)) as Record<string, unknown>) : undefined,
    model: o.model,
    reasoning,
    mcp: o.tools?.mcp,
    web: Boolean(o.tools?.web?.search || o.tools?.web?.fetch),
    maxUsd: o.maxUsd,
    timeoutMs,
  });
  return {
    value: (o.schema ? o.schema.parse(r.value) : r.value) as T,
    costUsd: r.costUsd > 0 ? r.costUsd : o.estimateUsd,
    modelCalls: r.modelCalls,
    toolCalls: [],
    stopReason: "done",
    usage: r.usage,
  };
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
