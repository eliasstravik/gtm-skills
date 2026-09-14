import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FatalError } from "workflow";
import type { McpServer } from "./mcp";

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
  try {
    const servers = Object.entries(o.mcp ?? {}).map(([name, s]) => {
      const key = s.keyEnv ? process.env[s.keyEnv] : undefined;
      if (s.keyEnv && !key) throw new FatalError(`Set ${s.keyEnv} for the MCP server at ${s.url}`);
      const headers = key ? { [s.header ?? "Authorization"]: s.bearer === false ? key : `Bearer ${key}` } : {};
      return [name, { url: s.url, headers }] as const;
    });
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
      if (reply.is_error) throw new Error(`claude: ${reply.result ?? reply.terminal_reason}`);
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
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
runAgentCli.maxRetries = 0;

function run(cmd: string, args: string[], stdin: string, cwd: string, timeoutMs?: number): Promise<string> {
  // A nested claude or codex must not see the parent session's variables.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE") && !k.startsWith("CODEX")));
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], ...(timeoutMs && { timeout: timeoutMs, killSignal: "SIGTERM" }) });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(new Error(`${cmd} could not start: ${e.message}`)));
    child.on("close", (code, signal) => {
      if (code === 0) return resolve(out);
      if (signal && timeoutMs) return reject(new Error(`${cmd} was stopped after ${Math.round(timeoutMs / 1000)}s`));
      reject(new Error(`${cmd} exited ${code ?? signal}: ${(err.trim() || out).slice(-800)}`));
    });
    child.stdin.end(stdin);
  });
}
