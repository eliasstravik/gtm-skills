import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type HeadlessOptions = {
  cli: "claude" | "codex";
  prompt: string;
  /** JSON Schema for the reply; with zod: z.toJSONSchema(schema). */
  schema: Record<string, unknown>;
  /** MCP servers by name: a local command { command, args? } or a hosted server { url, headers? }. When given they are the only tools the CLI gets. */
  tools?: Record<string, { command: string; args?: string[] } | { url: string; headers?: Record<string, string> }>;
  /** Enforced by claude (--max-budget-usd); informational for codex. Default 1. */
  maxUsd?: number;
  /** Informational: codex 0.154 has no turn-cap flag. */
  maxTurns?: number;
};

/** One CLI call on the author's subscription, from a neutral directory. costUsd is claude's reported total_cost_usd, or estimateUsd. */
export async function headless(o: HeadlessOptions, estimateUsd = 0): Promise<{ value: unknown; costUsd: number }> {
  const dir = await mkdtemp(join(tmpdir(), "gtm-headless-"));
  // zod's toJSONSchema adds a $schema key that claude's --json-schema rejects.
  const { $schema: _omit, ...schema } = o.schema;
  try {
    let args: string[];
    if (o.cli === "claude") {
      args = ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--strict-mcp-config", "--max-budget-usd", String(o.maxUsd ?? 1)];
      if (o.tools) {
        const mcpServers = Object.fromEntries(Object.entries(o.tools).map(([name, t]) => [name, "url" in t ? { type: "http", url: t.url, headers: t.headers ?? {} } : t]));
        await writeFile(join(dir, "mcp.json"), JSON.stringify({ mcpServers }));
        args.push("--mcp-config", join(dir, "mcp.json"), "--allowedTools", "mcp__*");
      }
    } else {
      await writeFile(join(dir, "schema.json"), JSON.stringify(schema));
      args = ["exec", "-", "--output-schema", join(dir, "schema.json"), "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-o", join(dir, "last.json")];
      for (const [name, t] of Object.entries(o.tools ?? {})) {
        if ("url" in t) args.push("-c", `mcp_servers.${name}.url="${t.url}"`, "-c", `mcp_servers.${name}.http_headers=${JSON.stringify(t.headers ?? {})}`);
        else args.push("-c", `mcp_servers.${name}.command="${t.command}"`, "-c", `mcp_servers.${name}.args=${JSON.stringify(t.args ?? [])}`);
      }
    }
    const out = await run(o.cli, args, o.prompt, dir);
    if (o.cli === "claude") {
      const reply = JSON.parse(out);
      if (reply.is_error) throw new Error(`claude: ${reply.result ?? reply.terminal_reason}`);
      return { value: reply.structured_output ?? JSON.parse(reply.result), costUsd: reply.total_cost_usd ?? estimateUsd };
    }
    return { value: JSON.parse(await readFile(join(dir, "last.json"), "utf8")), costUsd: estimateUsd };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(cmd: string, args: string[], stdin: string, cwd: string): Promise<string> {
  // A nested claude must not see the parent session's variables.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE")));
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-500)}`))));
    child.stdin.end(stdin);
  });
}
