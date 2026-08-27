// gtm-lib v8
// Call agent() from inside a "use step" function; see the workflow contract for the step rules.
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { generateText, gateway, jsonSchema, Output, stepCountIs } from "ai";
import { z } from "zod";
import { provider, type PaidCallMeta } from "./provider";

export type AgentTools = "none" | "web";

export interface AgentInput<T extends z.ZodTypeAny> {
  prompt: string;
  schema: T;
  meta: PaidCallMeta;
  tools?: AgentTools;
  /** Claude checks this between turns. Other backends do not honor it. */
  maxUsd?: number;
  timeoutMs?: number;
  ttlMs?: number;
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
  parse: (stdout: string, context: Context) => Promise<BackendResult>;
};

type BackendResult = { value: unknown; costUsd?: number };

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
      return {
        value: result.structured_output ?? extractJson(result.result),
        costUsd:
          typeof result.total_cost_usd === "number"
            ? result.total_cost_usd
            : undefined,
      };
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
    parse: async (_stdout, context) => ({
      value: JSON.parse(await readFile(context.outFile, "utf8")),
    }),
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
    parse: async (stdout) => ({ value: extractJson(JSON.parse(stdout).result) }),
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
    parse: async (stdout) => ({ value: extractJson(JSON.parse(stdout).response) }),
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
    parse: async (stdout) => ({ value: extractJson(stdout) }),
  },
};

const CLI_ORDER = ["claude", "codex", "cursor", "gemini", "opencode"];

/**
 * GTM_AGENT_MODEL configures the Claude CLI or API model. The api backend uses
 * AI_GATEWAY_API_KEY with Vercel AI Gateway and defaults to
 * anthropic/claude-opus-5. Gateway web search runs one search call and one tool-free answer call.
 */
const API_BACKEND = "api";

export async function agent<T extends z.ZodTypeAny>(
  input: AgentInput<T>,
): Promise<z.infer<T>> {
  const schemaJson = strictSchema(z.toJSONSchema(input.schema));
  const runtimeInput: RuntimeInput = {
    prompt: input.prompt,
    schemaJson,
    tools: input.tools ?? "none",
    maxUsd: input.maxUsd,
    timeoutMs: input.timeoutMs,
  };
  const backend = await pickBackend();
  const model =
    process.env.GTM_AGENT_MODEL ??
    (backend === API_BACKEND ? "anthropic/claude-opus-5" : "default");
  const result = await provider({
    name: "agent",
    endpoint: `${backend}/${model}`,
    input: {
      prompt: input.prompt,
      schema: schemaJson,
      tools: runtimeInput.tools,
    },
    schema: input.schema,
    ttlMs: input.ttlMs ?? 30 * 24 * 60 * 60 * 1_000,
    costUsd: input.maxUsd,
    meta: input.meta,
    call: async () => {
      const called =
        backend === API_BACKEND
          ? await viaApi(runtimeInput)
          : await viaCli(backend, runtimeInput);
      return {
        value: called.value as z.input<T>,
        costUsd: called.costUsd ?? input.maxUsd,
      };
    },
  });
  return result.value;
}

type RuntimeInput = {
  prompt: string;
  schemaJson: Record<string, unknown>;
  tools: AgentTools;
  maxUsd?: number;
  timeoutMs?: number;
};

async function pickBackend(): Promise<string> {
  const explicit = process.env.GTM_AGENT_BACKEND;
  if (process.env.GTM_SANDBOX === "1" && explicit !== API_BACKEND) {
    throw new Error(
      "GTM_SANDBOX=1 requires GTM_AGENT_BACKEND=api; CLI backends are disabled in the sandbox.",
    );
  }
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

async function viaCli(name: string, input: RuntimeInput) {
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

    const env: Record<string, string> = {
      HOME: process.env.HOME ?? "",
      PATH: process.env.PATH ?? "",
      NO_COLOR: "1",
      TERM: "dumb",
    };
    if (name === "claude" && process.env.GTM_AGENT_MODEL) {
      env.ANTHROPIC_MODEL = process.env.GTM_AGENT_MODEL;
    }
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

async function viaApi(input: RuntimeInput): Promise<BackendResult> {
  const model = process.env.GTM_AGENT_MODEL ?? "anthropic/claude-opus-5";
  const abortSignal = AbortSignal.timeout(input.timeoutMs ?? 300_000);
  const output = Output.object({ schema: jsonSchema(input.schemaJson) });
  const costs: number[] = [];
  const record = (result: { providerMetadata?: Record<string, unknown> }) => {
    const metadata = result.providerMetadata?.gateway as { cost?: number | string } | undefined;
    if (metadata?.cost !== undefined) costs.push(Number(metadata.cost));
  };

  if (input.tools !== "web") {
    const result = await generateText({ model, prompt: input.prompt, output, abortSignal });
    record(result);
    return finish(result.output, costs);
  }

  // Web mode runs two calls on purpose. A single call with a forced tool and a
  // structured output lets the model answer in the same step as the search, so
  // the evidence never reaches the answer. Call one only searches; call two
  // answers from that evidence with no tools.
  const search = await generateText({
    model,
    prompt: [
      "Make exactly one Exa search call using one comprehensive query for the task below. Do not answer the task in this turn.",
      input.prompt,
    ].join("\n\n"),
    tools: {
      exa_search: gateway.tools.exaSearch({
        type: "fast",
        numResults: 5,
        contents: {
          text: {
            maxCharacters: 2_500,
            verbosity: "compact",
            includeSections: ["body", "metadata"],
          },
          highlights: { maxCharacters: 1_000 },
          maxAgeHours: 0,
          livecrawlTimeout: 10_000,
          extras: { links: 10 },
        },
      }),
    },
    toolChoice: { type: "tool", toolName: "exa_search" },
    stopWhen: stepCountIs(1),
    abortSignal,
  });
  record(search);
  const answer = await generateText({
    model,
    messages: [
      ...search.response.messages,
      {
        role: "user",
        content: [
          "Using only the search evidence above, produce the structured result now. Omit anything the evidence does not support.",
          input.prompt,
        ].join("\n\n"),
      },
    ],
    output,
    abortSignal,
  });
  record(answer);
  return finish(answer.output, costs);
}

function finish(value: unknown, costs: number[]): BackendResult {
  const reported = costs.filter((cost) => Number.isFinite(cost));
  return {
    value,
    costUsd: reported.length ? reported.reduce((sum, cost) => sum + cost, 0) : undefined,
  };
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
