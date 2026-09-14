import { createMCPClient } from "@ai-sdk/mcp";
import { FatalError } from "workflow";
import { cached } from "./cache";

/**
 * Hosted MCP servers for agent stages. Every call is a "use step": a fresh client per call, the key read from the
 * workflow project's variables, nothing but plain JSON crossing the workflow boundary.
 */
export type McpServer = {
  /** The server's HTTP endpoint. */
  url: string;
  /** Name of the variable that holds the key, MONID_API_KEY for example; the value never appears in code or prompts. Omit for a public server. */
  keyEnv?: string;
  /** Header the key goes in; Authorization by default, sent as `Bearer <key>` unless `bearer` is false. */
  header?: string;
  bearer?: boolean;
  /** Only these tool names are offered to the model. */
  allow?: string[];
  /** Per-tool call limit within one agent stage. */
  maxCalls?: number;
  /** Per-request timeout, 45 seconds by default. */
  timeoutMs?: number;
};

export type McpToolDefinition = { name: string; description?: string; inputSchema: Record<string, unknown> };

const PAYLOAD_LIMIT = 400_000;

/** Tool definitions, cached for an hour per server address (definitions, never results). */
export async function listMcpTools(server: McpServer): Promise<McpToolDefinition[]> {
  "use step";
  const hit = await cached<McpToolDefinition[]>("mcp-tools", server.url, 60 * 60 * 1000, async () => {
    const mcp = await connect(server);
    try {
      const { tools } = await mcp.listTools({ options: requestOptions(server) });
      return { value: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown> })), costUsd: 0 };
    } finally {
      await mcp.close();
    }
  });
  return hit.value;
}

/**
 * One tool call. The result is the server's structured content, else its text content parsed as JSON when possible.
 * A tool error comes back as `{ isError: true, error }` so the model can read it and try another way; only a missing
 * key or a transport failure fails the step, and the step is never retried because the call may have been billed.
 */
export async function callMcpTool(server: McpServer, name: string, args: Record<string, unknown>): Promise<unknown> {
  "use step";
  const mcp = await connect(server);
  try {
    const result = await mcp.callTool({ name, arguments: args, options: requestOptions(server) });
    const content = result.structuredContent ?? parseContent(result.content);
    if (result.isError) return { isError: true, tool: name, error: typeof content === "string" ? content.slice(0, 4000) : bound(content) };
    return bound(content);
  } finally {
    await mcp.close();
  }
}
callMcpTool.maxRetries = 0;

async function connect(server: McpServer) {
  const headers: Record<string, string> = {};
  if (server.keyEnv) {
    const key = process.env[server.keyEnv];
    if (!key) throw new FatalError(`Set ${server.keyEnv} for the MCP server at ${server.url}`);
    headers[server.header ?? "Authorization"] = server.bearer === false ? key : `Bearer ${key}`;
  }
  return createMCPClient({ initializationOptions: requestOptions(server), transport: { type: "http", url: server.url, headers } });
}

const requestOptions = (server: McpServer) => ({ timeout: server.timeoutMs ?? 45_000, maxTotalTimeout: server.timeoutMs ?? 45_000 });

function parseContent(content: unknown): unknown {
  if (!Array.isArray(content)) return content;
  const texts = content.filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c.text === "string").map((c) => c.text);
  if (texts.length === 0) return content;
  const text = texts.join("\n");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function bound(value: unknown): unknown {
  const text = JSON.stringify(value) ?? "";
  return text.length <= PAYLOAD_LIMIT ? value : { truncated: true, json: text.slice(0, PAYLOAD_LIMIT) };
}
