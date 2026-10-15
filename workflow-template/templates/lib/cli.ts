import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FatalError } from "workflow";
import type { McpServer } from "./mcp";
import { failure } from "./failure";
import { mcpCredentialAdapter, cliEnvironment } from "./cli-mcp-proxy";

/**
 * The Claude Code and Codex backends of runAgent: the whole agent runs inside this one step through the CLI on the
 * author's subscription, this machine only. The CLI does its own tool loop, so there are no per-tool steps, no
 * approvals, and no stream; the trade is a subscription paying instead of the Gateway.
 */
export type CliBackend = "claude" | "codex";

export type CliAgentOptions = {
  backend: CliBackend;
  instructions: string;
  prompt: string;
  /** JSON Schema, already sanitized; omit for plain text. */
  schema?: Record<string, unknown>;
  model?: string;
  reasoning?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  mcp?: Record<string, McpServer>;
  web?: boolean;
  /** Enforced by claude (--max-budget-usd); informational for codex. */
  maxUsd?: number;
  /** Wall-clock limit for the CLI process; it is killed when reached and the step fails. */
  timeoutMs?: number;
};

export type CliAgentResult = { value: unknown; costUsd: number; modelCalls: number; usage: { inputTokens: number; outputTokens: number } };

const EFFORT: Record<string, string> = { none: "low", minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "xhigh" };

/** One CLI run from a neutral directory; costUsd is claude's reported total_cost_usd, or 0 for codex (a subscription is not billed per call). */
export async function runAgentCli(o: CliAgentOptions): Promise<CliAgentResult> {
  "use step";
  if (process.env.VERCEL) throw new FatalError(`The ${o.backend} backend runs only on a personal computer; switch the stage to the gateway backend before hosting it`);
  const dir = await mkdtemp(join(tmpdir(), "gtm-agent-"));
  const adapters: Awaited<ReturnType<typeof mcpCredentialAdapter>>[] = [];
  try {
    const servers: [string, { url: string; headers: Record<string, string> }][] = [];
    for (const [name, s] of Object.entries(o.mcp ?? {})) {
      const key = s.keyEnv ? process.env[s.keyEnv] : undefined;
      if (s.keyEnv && !key) throw new FatalError(`Set ${s.keyEnv} for the MCP server at ${s.url}`);
      if (key) {
        const adapter = await mcpCredentialAdapter(s, key); adapters.push(adapter);
        servers.push([name, { url: adapter.url, headers: adapter.headers }]);
      } else servers.push([name, { url: s.url, headers: {} }]);
    }
    const prompt = `${o.instructions}\n\n---\n\n${o.prompt}`;
    if (o.backend === "claude") {
      const builtins = o.web ? "WebSearch,WebFetch" : "";
      const args = ["-p", "--output-format", "json", "--tools", builtins, "--strict-mcp-config", "--max-budget-usd", String(o.maxUsd ?? 1)];
      if (o.schema) args.push("--json-schema", JSON.stringify(o.schema));
      if (o.model) args.push("--model", o.model);
      if (o.reasoning) args.push("--effort", EFFORT[o.reasoning]);
      const allowed = [...(o.web ? ["WebSearch", "WebFetch"] : []), ...(servers.length ? ["mcp__*"] : [])];
      if (servers.length) {
        await writeFile(join(dir, "mcp.json"), JSON.stringify({ mcpServers: Object.fromEntries(servers.map(([n, s]) => [n, { type: "http", ...s }])) }));
        args.push("--mcp-config", join(dir, "mcp.json"));
      }
      if (allowed.length) args.push("--allowedTools", ...allowed);
      const reply = JSON.parse(await run("claude", args, prompt, dir, o.timeoutMs)) as { is_error?: boolean; result?: string; structured_output?: unknown; total_cost_usd?: number; num_turns?: number; usage?: { input_tokens?: number; output_tokens?: number }; terminal_reason?: string };
      if (reply.is_error) throw failure(undefined, { layer: "cli_result", provider: "claude", operation: "agent" });
      return {
        value: o.schema ? reply.structured_output ?? JSON.parse(reply.result ?? "null") : reply.result ?? "",
        costUsd: reply.total_cost_usd ?? 0,
        modelCalls: reply.num_turns ?? 1,
        usage: { inputTokens: reply.usage?.input_tokens ?? 0, outputTokens: reply.usage?.output_tokens ?? 0 },
      };
    }
    const args = ["exec", "-", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-o", join(dir, "last.txt")];
    if (o.schema) {
      await writeFile(join(dir, "schema.json"), JSON.stringify(o.schema));
      args.push("--output-schema", join(dir, "schema.json"));
    }
    if (o.model) args.push("-m", o.model);
    if (o.reasoning) args.push("-c", `model_reasoning_effort="${EFFORT[o.reasoning]}"`);
    if (o.web) args.push("-c", `web_search="live"`);
    for (const [name, s] of servers) {
      args.push("-c", `mcp_servers.${name}.url="${s.url}"`);
      if (Object.keys(s.headers).length) args.push("-c", `mcp_servers.${name}.http_headers=${JSON.stringify(s.headers)}`);
      // codex runs an MCP tool unattended only when that tool is marked "approve" by name, so the server's allow list is required.
      const allow = o.mcp?.[name]?.allow;
      if (!allow?.length) throw new FatalError(`The codex backend needs an allow list of tool names for the MCP server ${name}`);
      for (const toolName of allow) args.push("-c", `mcp_servers.${name}.tools.${toolName}.approval_mode="approve"`);
    }
    await run("codex", args, prompt, dir, o.timeoutMs);
    const text = await readFile(join(dir, "last.txt"), "utf8");
    return { value: o.schema ? JSON.parse(text) : text.trim(), costUsd: 0, modelCalls: 1, usage: { inputTokens: 0, outputTokens: 0 } };
  } catch (error) {
    if (error instanceof FatalError || (error instanceof Error && error.message.startsWith('{"layer":'))) throw error;
    throw failure(error, { layer: "cli_result", provider: o.backend, operation: "decode" });
  } finally {
    await Promise.all(adapters.map((adapter) => adapter.close()));
    await rm(dir, { recursive: true, force: true });
  }
}
runAgentCli.maxRetries = 0;

function run(cmd: string, args: string[], stdin: string, cwd: string, timeoutMs?: number): Promise<string> {
  // A nested claude or codex must not see the parent session's variables.
  const env = cliEnvironment(process.env);
  return new Promise((resolve, reject) => {
    const limit = timeoutMs ?? 900_000;
    if (!Number.isFinite(limit) || limit <= 0) return reject(new Error("CLI timeout must be positive and finite"));
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let bytes = 0;
    let stopped = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: Error) => {
      if (stopped) return;
      stopped = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      reject(error);
    };
    const timer = setTimeout(() => stop(failure(undefined, { layer: "cli_timeout", provider: cmd })), limit);
    const consume = (data: Buffer, stdout: boolean) => {
      bytes += data.length;
      if (bytes > 4_000_000) return stop(failure({ code: "ERR_OUTPUT_LIMIT" }, { layer: "cli_result", provider: cmd }));
      if (stdout) out += data.toString();
    };
    child.stdout.on("data", (data) => consume(data, true));
    child.stderr.on("data", (data) => consume(data, false));
    child.stdin.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") stop(failure(error, { layer: "cli_launch", provider: cmd }));
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(failure(error, { layer: "cli_launch", provider: cmd }));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (stopped) return;
      if (code === 0) return resolve(out);
      reject(failure({ code: signal }, { layer: "cli_exit", provider: cmd, ...(code !== null && { exitCode: code }) }));
    });
    child.stdin.end(stdin);
  });
}
