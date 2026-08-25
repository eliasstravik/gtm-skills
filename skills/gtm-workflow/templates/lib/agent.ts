// gtm-lib v1
// Workflow files call agent(). Do not put secrets in its prompt.
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  generateText,
  gateway,
  jsonSchema,
  Output,
  stepCountIs,
} from "ai";
import { z } from "zod";

export type AgentTools = "none" | "web";

export interface AgentInput<T extends z.ZodTypeAny> {
  prompt: string;
  schema: T;
  tools?: AgentTools;
  /** This is a hard per-call limit only for the claude backend. */
  maxUsd?: number;
  timeoutMs?: number;
}

type Context = {
  prompt: string;
  schemaJson: string;
  schemaFile: string;
  outFile: string;
  tools: AgentTools;
  maxUsd?: number;
};

type CliBackend = {
  bin: string;
  webSafe: boolean;
  args: (context: Context) => string[];
  parse: (stdout: string, context: Context) => Promise<unknown>;
};

const JSON_INSTRUCTION = (schemaJson: string) =>
  `\n\nRespond with only a JSON object matching this JSON Schema, no prose:\n${schemaJson}`;

const CLI: Record<string, CliBackend> = {
  /** Verified live. structured_output holds schema output. WebSearch and WebFetch can be allowlisted. */
  claude: {
    bin: "claude",
    webSafe: true,
    args: (context) => [
      "-p",
      context.prompt,
      "--output-format",
      "json",
      "--json-schema",
      context.schemaJson,
      "--permission-mode",
      "dontAsk",
      "--no-session-persistence",
      ...(context.tools === "web"
        ? [
            "--tools",
            "WebSearch,WebFetch",
            "--allowedTools",
            "WebSearch,WebFetch",
            "--max-turns",
            "30",
          ]
        : ["--tools", "", "--max-turns", "3"]),
      ...(context.maxUsd
        ? ["--max-budget-usd", String(context.maxUsd)]
        : []),
    ],
    parse: async (stdout) => {
      const result = JSON.parse(stdout);
      if (result.is_error) {
        throw new Error(`claude: ${result.result ?? "error"}`);
      }
      return result.structured_output ?? extractJson(result.result);
    },
  },
  /** Verified live. The -o file holds schema output. Read-only mode can still read disk, so webSafe is false. */
  codex: {
    bin: "codex",
    webSafe: false,
    args: (context) => [
      "exec",
      "--output-schema",
      context.schemaFile,
      "-o",
      context.outFile,
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--skip-git-repo-check",
      context.prompt,
    ],
    parse: async (_stdout, context) =>
      JSON.parse(await readFile(context.outFile, "utf8")),
  },
  /** Flags verified from help text. result holds text. The CLI has no web-only allowlist. */
  cursor: {
    bin: "agent",
    webSafe: false,
    args: (context) => [
      "-p",
      context.prompt + JSON_INSTRUCTION(context.schemaJson),
      "--output-format",
      "json",
    ],
    parse: async (stdout) => extractJson(JSON.parse(stdout).result),
  },
  /** Flags verified from help text. response holds text. Its tool controls were not verified, so webSafe is false. */
  gemini: {
    bin: "gemini",
    webSafe: false,
    args: (context) => [
      "-p",
      context.prompt + JSON_INSTRUCTION(context.schemaJson),
      "-o",
      "json",
    ],
    parse: async (stdout) => extractJson(JSON.parse(stdout).response),
  },
  /** Flags verified from help text. JSON events hold the text. The CLI has no verified web-only allowlist. */
  opencode: {
    bin: "opencode",
    webSafe: false,
    args: (context) => [
      "run",
      "--format",
      "json",
      context.prompt + JSON_INSTRUCTION(context.schemaJson),
    ],
    parse: async (stdout) => extractJson(stdout),
  },
};

const CLI_ORDER = ["claude", "codex", "cursor", "gemini", "opencode"];

/**
 * The api backend uses AI_GATEWAY_API_KEY with Vercel AI Gateway. It defaults
 * to anthropic/claude-opus-5 and accepts a provider/model override through
 * GTM_AGENT_MODEL. Gateway web search is bounded to eight model steps.
 */
const API_BACKEND = "api";

// Zod schemas are not serializable step arguments. Convert the schema before
// the step, then validate the plain result back in the workflow body.
export async function agent<T extends z.ZodTypeAny>(
  input: AgentInput<T>,
): Promise<z.infer<T>> {
  const schemaJson = strictSchema(z.toJSONSchema(input.schema));
  const result = await runAgent({
    prompt: input.prompt,
    schemaJson,
    tools: input.tools ?? "none",
    maxUsd: input.maxUsd,
    timeoutMs: input.timeoutMs,
  });
  return input.schema.parse(result);
}

type StepInput = {
  prompt: string;
  schemaJson: Record<string, unknown>;
  tools: AgentTools;
  maxUsd?: number;
  timeoutMs?: number;
};

export async function runAgent(input: StepInput): Promise<unknown> {
  "use step";
  const backend = await pickBackend();
  return backend === API_BACKEND
    ? viaApi(input)
    : viaCli(backend, input);
}

// Workflow reads maxRetries from the step function. Zero means one attempt.
runAgent.maxRetries = 0;

async function pickBackend(): Promise<string> {
  const explicit = process.env.GTM_AGENT_BACKEND;
  if (explicit) {
    if (explicit === API_BACKEND) {
      if (!process.env.AI_GATEWAY_API_KEY) {
        throw new Error(
          "The api agent backend needs AI_GATEWAY_API_KEY with a spending budget.",
        );
      }
      return explicit;
    }
    if (!CLI[explicit]) {
      throw new Error(`Unknown GTM_AGENT_BACKEND "${explicit}"`);
    }
    return explicit;
  }

  for (const name of CLI_ORDER) {
    if (await onPath(CLI[name].bin)) return name;
  }

  if (process.env.AI_GATEWAY_API_KEY) return API_BACKEND;

  throw new Error(
    "No agent backend: install a CLI agent (claude, codex, cursor, gemini, opencode) or set AI_GATEWAY_API_KEY.",
  );
}

async function viaCli(name: string, input: StepInput) {
  const backend = CLI[name];
  if (input.tools === "web" && !backend.webSafe) {
    throw new Error(
      `${name} cannot be restricted to web tools; use claude, set GTM_AGENT_BACKEND=api, or run without web tools.`,
    );
  }

  const cwd = await mkdtemp(join(tmpdir(), "gtm-agent-"));
  try {
    const schemaJson = JSON.stringify(input.schemaJson);
    const context: Context = {
      prompt: input.prompt,
      schemaJson,
      schemaFile: join(cwd, "schema.json"),
      outFile: join(cwd, "out.json"),
      tools: input.tools,
      maxUsd: input.maxUsd,
    };
    await writeFile(context.schemaFile, schemaJson);

    const env = {
      HOME: process.env.HOME ?? "",
      PATH: process.env.PATH ?? "",
      NO_COLOR: "1",
      TERM: "dumb",
    };
    const stdout = await run(backend.bin, backend.args(context), {
      cwd,
      env,
      timeoutMs: input.timeoutMs ?? 300_000,
    });
    return await backend.parse(stdout, context);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

async function viaApi(input: StepInput) {
  const web = input.tools === "web";
  const result = await generateText({
    model: process.env.GTM_AGENT_MODEL ?? "anthropic/claude-opus-5",
    prompt: input.prompt,
    output: Output.object({
      schema: jsonSchema(input.schemaJson),
    }),
    tools: web
      ? { web_search: gateway.tools.parallelSearch() }
      : undefined,
    stopWhen: web ? stepCountIs(8) : undefined,
  });
  return result.output;
}

function run(
  bin: string,
  args: string[],
  options: { cwd: string; env: Record<string, string>; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));

    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
      reject(new Error(`${bin} timed out after ${options.timeoutMs}ms`));
    }, options.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

async function onPath(bin: string) {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    try {
      await access(join(dir, bin), constants.X_OK);
      return true;
    } catch {}
  }
  return false;
}

function extractJson(text: unknown): unknown {
  const value = String(text ?? "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`No JSON object in agent output: ${value.slice(0, 200)}`);
  }
  return JSON.parse(value.slice(start, end + 1));
}

// Codex and OpenAI require additionalProperties: false on every object. This
// also makes every property required, so nullable fields must use .nullable().
function strictSchema(schema: any): any {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (schema && typeof schema === "object") {
    const result: any = {};
    for (const key of Object.keys(schema)) {
      if (key !== "$schema") result[key] = strictSchema(schema[key]);
    }
    if (result.type === "object") {
      result.additionalProperties = false;
      result.required = Object.keys(result.properties ?? {});
    }
    return result;
  }
  return schema;
}
