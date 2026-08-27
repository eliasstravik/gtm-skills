// gtm-lib v5
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { parseEnv } from "node:util";
import { executeReadOnly } from "../lib/db";

type Flags = Record<string, string | boolean>;

class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

const root = process.cwd();

main().catch((caught) => {
  const error =
    caught instanceof AppError
      ? caught
      : new AppError("internal_error", caught instanceof Error ? caught.message : String(caught));
  process.stderr.write(`${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`);
  process.exitCode = error.exitCode;
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "run") return run(rest);
  if (command === "runs" && rest[0] === "get") return runsGet(rest.slice(1));
  if (command === "approve") return approve(rest);
  if (command === "query") return query(rest);
  if (command === "check") return check();
  throw new AppError(
    "invalid_command",
    "Use run, runs get, approve, query, or check.",
    2,
  );
}

async function run(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const slug = positionals[0];
  const inputPath = stringFlag(flags, "input");
  if (!slug) throw new AppError("invalid_input", "run requires <slug> --input <file>", 2);
  const workflow = await findWorkflow(slug, stringFlag(flags, "url"));
  const source = await readFile(workflow, "utf8");
  const kind = header(source, "Kind");
  if (!inputPath) {
    throw new AppError(
      "invalid_input",
      kind === "scheduled"
        ? "scheduled workflows need --input; write scheduledInput to a file"
        : "run requires <slug> --input <file>",
      2,
    );
  }
  if (kind === "scheduled" && flags.checkpoint !== undefined) {
    throw new AppError(
      "invalid_checkpoint",
      "scheduled workflows do not accept --checkpoint",
      2,
    );
  }
  const body = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const rows = rowCount(body);
  const maxRows = exportedNumber(source, "MAX_ROWS");
  const costPerRowUsd = exportedNumber(source, "COST_PER_ROW_USD");
  const maxSpendUsd = exportedNumber(source, "MAX_SPEND_USD");
  const projectedCostUsd = rows * costPerRowUsd;
  const stages = [...source.matchAll(/async function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*["']use step["']/g)].map(
    (match) => match[1],
  );
  const withinCaps = rows <= maxRows && projectedCostUsd <= maxSpendUsd;
  const dryRun = {
    workflow: slug,
    rows,
    stages,
    maxRows,
    costPerRowUsd,
    projectedCostUsd,
    maxSpendUsd,
    withinCaps,
  };
  if (flags["dry-run"]) {
    print(dryRun);
    if (!withinCaps) process.exitCode = 2;
    return;
  }
  if (!withinCaps) {
    throw new AppError("caps_exceeded", "The input exceeds the accepted workflow caps.", 2);
  }

  const origin = await resolveOrigin(workflow, flags);
  const path = workflowPath(workflow);
  const checkpoint = stringFlag(flags, "checkpoint");
  const url = new URL(`/api/run/${path}`, origin);
  if (checkpoint) url.searchParams.set("checkpoint", checkpoint);
  const started = await request(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!flags.wait) return print(started);
  print(await poll(origin, started.runKey ?? started.runId));
}

async function runsGet(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const identifier = positionals[0];
  if (!identifier) throw new AppError("invalid_run", "runs get requires a run id or run key", 2);
  const origin = await resolveOrigin(undefined, flags);
  const result = flags.wait
    ? await poll(origin, identifier)
    : await request(new URL(`/api/runs/${encodeURIComponent(identifier)}`, origin), {
        headers: authHeaders(),
      });
  print(result);
}

async function approve(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const token = positionals[0];
  if (!token) throw new AppError("invalid_token", "approve requires a token", 2);
  if (Boolean(flags.yes) === Boolean(flags.no)) {
    throw new AppError("invalid_decision", "approve requires exactly one of --yes or --no", 2);
  }
  const slug = token.split(".")[0];
  const runKey = token.split(".")[1];
  const workflow = await findWorkflow(slug, stringFlag(flags, "url"));
  const origin = await resolveOrigin(workflow, flags);
  await request(new URL(`/api/approve/${encodeURIComponent(token)}`, origin), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      approved: Boolean(flags.yes),
      comment: stringFlag(flags, "comment") ?? null,
    }),
  });
  if (!flags.wait) return print({ approved: Boolean(flags.yes) });

  while (true) {
    const row = await request(new URL(`/api/runs/${encodeURIComponent(runKey)}`, origin), {
      headers: authHeaders(),
    });
    const pendingToken = row.approval?.token;
    if (terminal(row.status) || (row.status === "waiting" && pendingToken !== token)) {
      return print(withOperatorHint(row));
    }
    await delay(500);
  }
}

async function query(args: string[]) {
  const { flags } = parseArgs(args);
  const statement = stringFlag(flags, "sql");
  if (!statement) throw new AppError("invalid_query", "query requires --sql", 2);
  if (flags.cloud) {
    if (!existsSync(join(root, ".env.turso"))) {
      throw new AppError("missing_cloud_env", ".env.turso is required with --cloud", 2);
    }
    const values = parseEnv(await readFile(join(root, ".env.turso"), "utf8"));
    process.env.TURSO_DATABASE_URL = values.TURSO_DATABASE_URL;
    process.env.TURSO_AUTH_TOKEN = values.TURSO_AUTH_TOKEN;
  }
  const rows = await executeReadOnly(statement);
  const format = stringFlag(flags, "format") ?? "json";
  if (format === "json") return print(rows);
  if (format === "csv") return process.stdout.write(`${toCsv(rows)}\n`);
  if (format === "markdown") return process.stdout.write(`${toMarkdown(rows)}\n`);
  throw new AppError("invalid_format", "format must be json, csv, or markdown", 2);
}

async function check() {
  await command(join(root, "node_modules", ".bin", "nitro"), ["build"]);
  await command(join(root, "node_modules", ".bin", "workflow"), ["validate"]);
  const workflows = await workflowFiles();
  for (const file of workflows) {
    const source = await readFile(file, "utf8");
    const slug = basename(file, ".ts");
    const expected = slug.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
    if (!new RegExp(`export\\s+async\\s+function\\s+${expected}\\s*\\(`).test(source)) {
      throw new AppError("invalid_export", `${relative(root, file)} must export ${expected}`, 2);
    }
    if (
      /rows\s*:\s*z\.array/.test(source) &&
      !/\.pick\s*\(\s*\{[^}]*key\s*:/s.test(source) &&
      !/rows\s*:\s*z\.array\s*\(\s*z\.object\s*\(\s*\{[^}]*key\s*:/s.test(source)
    ) {
      throw new AppError("invalid_rows_input", `${relative(root, file)} rows input must include key`, 2);
    }
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const expectedVersion = packageJson.gtm?.libVersion;
  for (const file of await headeredFiles()) {
    const first = (await readFile(file, "utf8")).split("\n", 1)[0];
    if (first !== `// gtm-lib v${expectedVersion}`) {
      throw new AppError(
        "lib_version_mismatch",
        `${relative(root, file)} has ${first || "no header"}; expected gtm-lib v${expectedVersion}`,
        2,
      );
    }
  }
  print({ ok: true, workflows: workflows.length, libVersion: expectedVersion });
}

async function poll(origin: string, identifier: string) {
  while (true) {
    const row = await request(new URL(`/api/runs/${encodeURIComponent(identifier)}`, origin), {
      headers: authHeaders(),
    });
    if (terminal(row.status) || row.status === "waiting") return withOperatorHint(row);
    await delay(500);
  }
}

function withOperatorHint(row: any) {
  if (row.status !== "waiting") return row;
  if (row.approval?.token) {
    return {
      ...row,
      operatorCommand: `npm run gtm -- approve ${row.approval.token} --yes --wait`,
    };
  }
  return row;
}

async function request(url: URL, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new AppError(
      "network_error",
      `Cannot reach ${url.origin}; start the workflow project or pass --url.`,
      5,
    );
  }
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return payload as any;
  const code = payload?.error?.code ?? `http_${response.status}`;
  const exitCode = response.status === 401 ? 3 : response.status === 404 ? 6 : response.status === 429 ? 4 : 1;
  throw new AppError(code, payload?.error?.message ?? response.statusText, exitCode);
}

async function resolveOrigin(workflow: string | undefined, flags: Flags): Promise<string> {
  const override = stringFlag(flags, "url") ?? process.env.GTM_BASE_URL;
  if (override) return override;
  const candidates = workflow ? [workflow] : await workflowFiles();
  const locations = new Set<string>();
  for (const file of candidates) locations.add(header(await readFile(file, "utf8"), "Runs"));
  if (locations.size !== 1) {
    throw new AppError("ambiguous_origin", "Pass --url when workflows use more than one origin.", 2);
  }
  if ([...locations][0] === "on this computer") {
    if (existsSync(join(root, ".env.local"))) {
      throw new AppError(
        "cloud_env_local",
        ".env.local would point local runs at the cloud database; remove it before starting Nitro.",
        2,
      );
    }
    return "http://127.0.0.1:3000";
  }
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const url = packageJson.gtm?.vercel?.url;
  if (!url) throw new AppError("not_deployed", "This workflow has no recorded production URL.", 2);
  return url.startsWith("http") ? url : `https://${url}`;
}

async function findWorkflow(slug: string, urlOverride?: string) {
  const matches = (await workflowFiles()).filter((file) => basename(file, ".ts") === slug);
  if (matches.length === 0) throw new AppError("not_found", `No workflow named ${slug}`, 6);
  if (matches.length > 1 && !urlOverride && !process.env.GTM_BASE_URL) {
    throw new AppError("ambiguous_workflow", `More than one ${slug} exists; pass --url.`, 2);
  }
  return matches[0];
}

async function workflowFiles() {
  const directory = join(root, "workflows");
  if (!existsSync(directory)) return [];
  return walk(directory, (file) => file.endsWith(".ts"));
}

async function headeredFiles() {
  const files = (await walk(join(root, "lib"), (file) => file.endsWith(".ts"))).concat([
    join(root, "server", "api", "run", "[...workflow].ts"),
    join(root, "server", "api", "runs", "[runId].get.ts"),
    join(root, "server", "api", "approve", "[token].post.ts"),
    join(root, "scripts", "gtm.ts"),
    join(root, "drizzle.config.ts"),
    join(root, "nitro.config.ts"),
  ]);
  return files;
}

async function walk(directory: string, accept: (file: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, accept)));
    else if (accept(path)) found.push(path);
  }
  return found.sort();
}

function workflowPath(file: string) {
  return relative(join(root, "workflows"), file).slice(0, -3).split(sep).join("/");
}

function rowCount(body: unknown): number {
  if (body && typeof body === "object" && Array.isArray((body as any).rows)) {
    return (body as any).rows.length;
  }
  if (body && typeof body === "object") {
    const arrays = Object.values(body).filter(Array.isArray) as unknown[][];
    if (arrays.length === 1) return arrays[0].length;
    if (arrays.length > 1) {
      throw new AppError("ambiguous_rows", "Input has more than one top-level array.", 2);
    }
  }
  return Array.isArray(body) ? body.length : 1;
}

function header(source: string, name: string) {
  const match = source.match(new RegExp(`^\\s*\\*\\s+${name}:\\s*(.+)$`, "m"));
  if (!match) throw new AppError("invalid_workflow", `Missing ${name}: header`, 2);
  return match[1].trim();
}

function exportedNumber(source: string, name: string) {
  const match = source.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*([0-9.]+)`));
  if (!match) throw new AppError("invalid_workflow", `Missing numeric ${name}`, 2);
  return Number(match[1]);
}

function authHeaders() {
  const secret = process.env.GTM_RUN_SECRET;
  if (!secret) throw new AppError("unauthorized", "GTM_RUN_SECRET is missing from .env", 3);
  return { authorization: `Bearer ${secret}` };
}

function parseArgs(args: string[]) {
  const positionals: string[] = [];
  const flags: Flags = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      positionals.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else flags[key] = true;
  }
  return { positionals, flags };
}

function stringFlag(flags: Flags, name: string) {
  return typeof flags[name] === "string" ? flags[name] : undefined;
}

function terminal(status: string) {
  return ["completed", "failed", "cancelled"].includes(status);
}

async function command(executable: string, args: string[]) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise()
        : reject(new AppError("check_failed", stderr.slice(-2_000) || `${basename(executable)} failed`, 2)),
    );
  });
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [columns.map(quote).join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\n");
}

function toMarkdown(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "No rows.";
  const columns = Object.keys(rows[0]);
  const cell = (value: unknown) => String(value ?? "").replaceAll("|", "\\|");
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(" | ")} |`),
  ].join("\n");
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
