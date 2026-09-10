// gtm-lib v20
import { createMCPClient } from "@ai-sdk/mcp";
import Ajv from "ajv";
import { agentDefinition, toolDefinition, type ToolDefinition } from "./capabilities";
import { reserveAgentCall, settleAgentCall } from "./agent-ledger";
import type { PaidCallMeta } from "./provider";
import { redact, redactedError } from "./redact";

function validate(schema: Record<string, unknown>, value: unknown) {
  const validator = new Ajv({ strict: false, allErrors: true }).compile(schema);
  if (!validator(value)) throw new Error("Tool data does not match its committed schema");
}

export function validateAgentSchemas(definition: unknown): void {
  const spec = agentDefinition.parse(definition);
  const ajv = new Ajv({ strict: false });
  ajv.compile(spec.outputSchema);
  for (const tool of spec.tools) {
    ajv.compile(tool.inputSchema);
    ajv.compile(tool.outputSchema);
    if (tool.recoverableErrorSchema) ajv.compile(tool.recoverableErrorSchema);
  }
}

export async function validateAgentResult(schema: Record<string, unknown>, value: unknown) {
  "use step";
  validate(schema, value);
  return value;
}

export function sanitizeToolOutput(value: unknown): unknown {
  const secrets = Object.entries(process.env).filter(([name, secret]) =>
    /_(?:KEY|TOKEN|SECRET)$/.test(name) && secret).map(([, secret]) => secret!);
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      for (const secret of secrets) item = (item as string).replaceAll(secret, "[REDACTED]");
      return item;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) =>
      [key, /^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key)
        ? "[REDACTED]" : visit(entry)]));
    return item;
  };
  return visit(value);
}

export function bindToolArguments(definition: ToolDefinition, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Tool input must be an object");
  const args = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(definition.fixedArguments)) {
    if (key in args && JSON.stringify(args[key]) !== JSON.stringify(value)) {
      throw new Error(`Tool argument ${key} is outside the accepted scope`);
    }
  }
  const bound = { ...args, ...definition.fixedArguments };
  validate(definition.inputSchema, bound);
  return bound;
}

/** MCP servers can encode an expected no-match as isError. Recovery is explicit and read-only. */
function mcpErrorData(result: Record<string, unknown>) {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const content = result.content;
  if (Array.isArray(content) && content.length === 1 && content[0]?.type === "text") {
    try { return JSON.parse(content[0].text); } catch { /* Non-JSON errors remain fatal. */ }
  }
  return undefined;
}

function mcpErrorMessage(result: Record<string, unknown>): string {
  const text = Array.isArray(result.content)
    ? result.content.filter((item) => item?.type === "text").map((item) => item.text).join("\n") : "";
  return redact(`MCP tool reported an error: ${text || JSON.stringify(result.structuredContent) || "no details"}`);
}

/** A tool call is a durable step; clients and credential values never cross its boundary. */
export async function executeAgentTool(
  definition: ToolDefinition, input: unknown, meta: PaidCallMeta,
  operation: string, maxSpendUsd: number, maxToolCalls: number,
  abortSignal?: AbortSignal,
) {
  "use step";
  const spec = toolDefinition.parse(definition);
  const args = bindToolArguments(spec, input);
  const headers: Record<string, string> = {};
  if (spec.transport.auth) {
    const auth = spec.transport.auth;
    const secret = process.env[auth.environmentVariable];
    if (!secret) throw new Error(`Configure ${auth.environmentVariable} in the trusted workflow runtime`);
    headers[auth.header] = `${auth.prefix}${secret}`;
  }
  const id = await reserveAgentCall({ meta, operation, provider: "agent-tool", endpoint: spec.name,
    costUsd: spec.costUsd, costKind: spec.costKind, maxSpendUsd, maxCalls: spec.maxCalls, maxToolCalls });
  try {
    const timeout = AbortSignal.timeout(spec.timeoutMs);
    const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;
    let value: unknown;
    let recoveredError: string | undefined;
    if (spec.transport.kind === "mcp") {
      const client = await createMCPClient({
        maxRetries: 0,
        protocolVersionDiscovery: false,
        transport: { type: "http", url: spec.transport.url, headers, redirect: "error" },
        initializationOptions: { timeout: spec.timeoutMs, signal },
      });
      try {
        const result = await client.callTool({ name: spec.transport.tool, arguments: args,
          options: { timeout: spec.timeoutMs, signal } });
        if (Buffer.byteLength(JSON.stringify(result)) > spec.maxOutputBytes) throw new Error("Tool output exceeds accepted size");
        if (result.isError) {
          const recoverable = spec.recoverableErrorSchema && new Ajv({ strict: false })
            .compile(spec.recoverableErrorSchema)(mcpErrorData(result));
          if (!recoverable) throw new Error(mcpErrorMessage(result));
          recoveredError = mcpErrorMessage(result);
        }
        value = result;
      } finally {
        await client.close();
      }
    } else {
      const url = new URL(spec.transport.url);
      if (spec.transport.method === "GET") {
        for (const [key, item] of Object.entries(args)) {
          url.searchParams.set(key, typeof item === "string" ? item : JSON.stringify(item));
        }
      }
      const response = await fetch(url, { method: spec.transport.method, redirect: "error", signal,
        headers: { "Content-Type": "application/json", ...headers },
        ...(spec.transport.method === "POST" ? { body: JSON.stringify(args) } : {}) });
      if (!response.ok) throw new Error(`Tool request failed with HTTP ${response.status}`);
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Tool returned no body");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > spec.maxOutputBytes) throw new Error("Tool output exceeds accepted size");
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel(); }
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    if (Buffer.byteLength(JSON.stringify(value)) > spec.maxOutputBytes) throw new Error("Tool output exceeds accepted size");
    value = sanitizeToolOutput(value);
    validate(spec.outputSchema, value);
    await settleAgentCall(id, undefined, recoveredError !== undefined, recoveredError);
    return value;
  } catch (error) {
    await settleAgentCall(id, undefined, true, redact(error));
    throw redactedError(error);
  }
}
executeAgentTool.maxRetries = 0;
