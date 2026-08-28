// gtm-lib v11
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { createScanner, LanguageVariant, SyntaxKind } from "typescript/unstable/ast";
import { executeReadOnly } from "../lib/db";
import { redact, redactValue } from "../lib/redact";

type Flags = Record<string, string | boolean>;
type ProviderListRow = {
  name: string;
  endpoints: string[];
  cost_per_request: string;
  cache_ttl: string;
  environment: { name: string; set: boolean }[];
  mode: string;
  fixture_covered: boolean;
  workflows: string[];
};
type DiagramStatus = "done" | "failed" | "active" | "pending";
type DiagramOverlay = Map<string, { status: DiagramStatus; costUsd: number }>;

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
      : new AppError("internal_error", redact(caught));
  process.stderr.write(`${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`);
  process.exitCode = error.exitCode;
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "run") return run(rest);
  if (command === "runs" && rest[0] === "get") return runsGet(rest.slice(1));
  if (command === "providers" && rest[0] === "list") return providersList(rest.slice(1));
  if (command === "diagram") return diagram(rest);
  if (command === "approve") return approve(rest);
  if (command === "cancel") return cancel(rest);
  if (command === "query") return query(rest);
  if (command === "check") return check();
  throw new AppError(
    "invalid_command",
    "Use run, runs get, providers list, diagram, approve, cancel, query, or check.",
    2,
  );
}

async function run(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const slug = positionals[0];
  let inputPath = stringFlag(flags, "input");
  const sourceRun = stringFlag(flags, "rows-from-run");
  if (!slug) throw new AppError("invalid_input", "run requires <slug> and an input source", 2);
  if (inputPath && sourceRun) {
    throw new AppError("invalid_input", "Use either --input or --rows-from-run, not both.", 2);
  }
  if (flags.only !== undefined && !sourceRun) {
    throw new AppError("invalid_input", "--only requires --rows-from-run", 2);
  }
  const workflow = await findWorkflow(slug, stringFlag(flags, "url"));
  const source = await readFile(workflow, "utf8");
  const kind = header(source, "Kind");
  if (sourceRun) {
    inputPath = await writeRowsFromRunInput(slug, sourceRun, stringFlag(flags, "only") ?? "failed", flags);
  }
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
  const loaded = await loadWorkflow(workflow, body);
  const rows = Array.isArray(loaded.input?.rows) ? loaded.input.rows.length : 1;
  const maxRows = loaded.maxRows;
  const costPerRowUsd = loaded.costPerRowUsd;
  const maxSpendUsd = loaded.maxSpendUsd;
  const projectedCostUsd = rows * costPerRowUsd;
  const stages = stepNames(source);
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
    ...(sourceRun ? { rowsFromRun: sourceRun, only: stringFlag(flags, "only") ?? "failed", inputFile: relative(root, inputPath) } : {}),
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
  const scheduledFor = stringFlag(flags, "scheduled-for");
  if (scheduledFor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
      throw new AppError("invalid_scheduled_for", "--scheduled-for must be YYYY-MM-DD", 2);
    }
    url.searchParams.set("scheduled-for", scheduledFor);
  }
  const workspaceHead = await deploymentHead(workflow, origin);
  const started = await request(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      ...(workspaceHead ? { "x-gtm-workspace-head": workspaceHead } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!flags.wait) return print(started);
  print(await runSummary(await poll(origin, started.runKey ?? started.runId, waitSeconds(flags))));
}

async function runsGet(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const identifier = positionals[0];
  if (!identifier) throw new AppError("invalid_run", "runs get requires a run id or run key", 2);
  const origin = await resolveOrigin(undefined, flags);
  let result = flags.wait
    ? await poll(origin, identifier, waitSeconds(flags))
    : await request(new URL(`/api/runs/${encodeURIComponent(identifier)}`, origin), {
        headers: authHeaders(),
      });
  result = await runSummary(withRunState(result, false));
  if (flags.failed) {
    await configureReadOnly(flags);
    result.failed_rows = await failedRunRows(result.runKey);
  }
  const format = stringFlag(flags, "format") ?? "json";
  if (format === "json") return print(result);
  if (format === "markdown") return process.stdout.write(`${runMarkdown(result)}\n`);
  throw new AppError("invalid_format", "format must be json or markdown", 2);
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

  print(await runSummary(await poll(origin, runKey, waitSeconds(flags), token)));
}

async function cancel(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const identifier = positionals[0];
  if (!identifier) throw new AppError("invalid_run", "cancel requires a run id or run key", 2);
  const origin = await resolveOrigin(undefined, flags);
  const row = await request(new URL(`/api/runs/${encodeURIComponent(identifier)}/cancel`, origin), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason: stringFlag(flags, "reason") ?? null }),
  });
  if (!flags.wait) return print(row);
  print(await runSummary(await poll(origin, row.runKey ?? identifier, waitSeconds(flags))));
}

async function providersList(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const directory = join(root, "providers");
  const fixtureDirectory = join(directory, "__fixtures__");
  const fixtures = existsSync(fixtureDirectory)
    ? await walk(fixtureDirectory, () => true)
    : [];
  const workflows = await Promise.all(
    (await workflowFiles()).map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );
  const adapters = existsSync(directory)
    ? await walk(directory, (file) => file.endsWith(".ts") && !file.includes(`${sep}__fixtures__${sep}`))
    : [];
  const keywords = positionals.map((value) => value.toLowerCase());
  const rows: ProviderListRow[] = [];
  for (const file of adapters) {
    const source = await readFile(file, "utf8");
    const name = basename(file, ".ts");
    const endpoints = listHeader(source, "Endpoints", /endpoint\s*:\s*["']([^"']+)["']/g);
    const envNames = listHeader(source, "Environment", /process\.env\.([A-Z][A-Z0-9_]*)/g);
    const row = {
      name,
      endpoints,
      cost_per_request: headerValue(source, "Cost per request") ?? headerValue(source, "Cost") ?? "not documented",
      cache_ttl: headerValue(source, "Cache TTL") ?? "not documented",
      environment: envNames.map((envName) => ({
        name: envName,
        set: typeof process.env[envName] === "string" && process.env[envName]!.length > 0,
      })),
      mode: headerValue(source, "Mode") ?? "not documented",
      fixture_covered: fixtures.some((fixture) => relative(fixtureDirectory, fixture).toLowerCase().includes(name.toLowerCase())),
      workflows: workflows
        .filter(({ source: workflowSource }) => workflowImportsProvider(workflowSource, name))
        .map(({ file: workflowFile }) => workflowPath(workflowFile)),
    };
    const haystack = `${name}\n${source}`.toLowerCase();
    if (keywords.every((keyword) => haystack.includes(keyword))) rows.push(row);
  }
  rows.sort((left, right) => left.name.localeCompare(right.name));
  const format = stringFlag(flags, "format") ?? "table";
  if (format === "json") return print(rows);
  if (format === "table") {
    return process.stdout.write(`${toMarkdown(rows.map((row) => ({
      adapter: row.name,
      endpoints: row.endpoints.join(", "),
      cost: row.cost_per_request,
      cache_ttl: row.cache_ttl,
      environment: row.environment.map(({ name, set }) => `${name}=${set ? "set" : "unset"}`).join(", "),
      fixtures: row.fixture_covered ? "yes" : "no",
      workflows: row.workflows.join(", ") || "none",
      mode: row.mode,
    })))}\n`);
  }
  throw new AppError("invalid_format", "format must be table or json", 2);
}

async function diagram(args: string[]) {
  const { positionals, flags } = parseArgs(args);
  const slug = positionals[0];
  if (!slug) throw new AppError("invalid_workflow", "diagram requires <slug>", 2);
  const workflow = await findWorkflow(slug, stringFlag(flags, "url"));
  const stages = stepNames(await readFile(workflow, "utf8"));
  const runKey = stringFlag(flags, "run");
  let overlay: DiagramOverlay | undefined;
  if (runKey) {
    await configureReadOnly(flags);
    overlay = await diagramOverlay(slug, runKey, stages);
  }
  const format = stringFlag(flags, "format") ?? "mermaid";
  if (format === "mermaid") return process.stdout.write(`${mermaidDiagram(stages, overlay)}\n`);
  if (format === "ascii") return process.stdout.write(`${asciiDiagram(stages, overlay)}\n`);
  throw new AppError("invalid_format", "format must be mermaid or ascii", 2);
}

async function query(args: string[]) {
  const { flags } = parseArgs(args);
  const statement = stringFlag(flags, "sql");
  if (!statement) throw new AppError("invalid_query", "query requires --sql", 2);
  await configureReadOnly(flags);
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
    if (!/\barg\s*=\s*input\.parse\s*\(\s*arg\s*\)/.test(source)) {
      throw new AppError(
        "invalid_input_parse",
        `${relative(root, file)} must assign arg = input.parse(arg) inside the workflow body`,
        2,
      );
    }
    if (
      /rows\s*:\s*z\.array/.test(source) &&
      !/\.pick\s*\(\s*\{[^}]*key\s*:/s.test(source) &&
      !/rows\s*:\s*z\.array\s*\(\s*z\.object\s*\(\s*\{[^}]*key\s*:/s.test(source)
    ) {
      throw new AppError("invalid_rows_input", `${relative(root, file)} rows input must include key`, 2);
    }
    validateWorkflowSource(file, source, expected);
  }
  await validateTableSources();
  await validateMigrationArtifacts();

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const expectedVersion = packageJson.gtm?.libVersion;
  for (const file of await headeredFiles()) {
    const contents = await readFile(file, "utf8");
    const first = contents.split("\n", 1)[0];
    if (first !== `// gtm-lib v${expectedVersion}`) {
      throw new AppError(
        "lib_version_mismatch",
        `${relative(root, file)} has ${first || "no header"}; expected gtm-lib v${expectedVersion}`,
        2,
      );
    }
    const path = relative(root, file).split(sep).join("/");
    const expectedHash = packageJson.gtm?.libHashes?.[path];
    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (!expectedHash) {
      throw new AppError("lib_hash_missing", `${path} has no gtm.libHashes entry`, 2);
    }
    if (expectedHash !== actualHash) {
      throw new AppError("lib_modified", `${path} was modified locally`, 2);
    }
  }
  const warnings = versionWarnings(packageJson);
  print({ ok: true, workflows: workflows.length, libVersion: expectedVersion, warnings });
}

function validateWorkflowSource(file: string, source: string, exportName: string) {
  const path = relative(root, file);
  const tokens = compilerTokens(source);
  const functions = functionBodies(source, tokens);
  for (const fn of functions) {
    const { name, directive: directiveText, body: bodyText } = fn;
    if (directiveText === "use step" && /\b(?:provider|agent)\s*\(/.test(bodyText)) {
      const noRetry = new RegExp(`\\b${name}\\.maxRetries\\s*=\\s*0\\b`).test(source);
      const retryableOnly = /catch\s*\([^)]*\)\s*\{[\s\S]*RetryableError[\s\S]*throw/.test(
        bodyText,
      );
      if (!noRetry && !retryableOnly) {
        throw new AppError(
          "paid_step_retries",
          `${path} paid step ${name} must set maxRetries = 0 or rethrow only RetryableError`,
          2,
        );
      }
    }
    if (directiveText === "use workflow") {
      const violations = ["Date.now", "Math.random", "fetch"].filter((call) =>
        new RegExp(`\\b${call.replace(".", "\\.")}\\s*\\(`).test(bodyText),
      );
      if (violations.length) {
        throw new AppError(
          "nondeterministic_workflow",
          `${path} workflow body calls ${[...new Set(violations)].join(", ")}`,
          2,
        );
      }
      if (!/\brunRows\s*\(/.test(bodyText) && !/\bupdateRun\s*\(/.test(bodyText)) {
        throw new AppError(
          "missing_terminal_bookkeeping",
          `${path} must call runRows() or terminal updateRun()`,
          2,
        );
      }
    }
  }
  if (!functions.some((fn) => fn.name === exportName)) {
    throw new AppError("invalid_export", `${path} must export ${exportName}`, 2);
  }

  let braceDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === SyntaxKind.OpenBraceToken) braceDepth += 1;
    if (token.kind === SyntaxKind.CloseBraceToken) braceDepth -= 1;
    if (braceDepth !== 0 || token.kind !== SyntaxKind.OpenParenToken) continue;
    const previous = tokens[index - 1];
    if (!previous || previous.kind !== SyntaxKind.Identifier) continue;
    if (tokens.slice(Math.max(0, index - 4), index).some((item) => item.kind === SyntaxKind.FunctionKeyword)) {
      continue;
    }
    let rootIndex = index - 1;
    while (
      rootIndex >= 2 &&
      tokens[rootIndex - 1].kind === SyntaxKind.DotToken &&
      tokens[rootIndex - 2].kind === SyntaxKind.Identifier
    ) {
      rootIndex -= 2;
    }
    if (tokens[rootIndex].text !== "z") {
      throw new AppError(
        "invalid_module_scope",
        `${path} executes ${tokens[rootIndex].text} at module scope`,
        2,
      );
    }
  }
}

async function validateTableSources() {
  const directory = join(root, "db", "tables");
  if (!existsSync(directory)) return;
  for (const file of await walk(directory, (candidate) => candidate.endsWith(".ts"))) {
    const source = await readFile(file, "utf8");
    compilerTokens(source);
    if (!/\bkey\s*:\s*[^,\n]+\.primaryKey\s*\(/.test(source)) {
      throw new AppError(
        "invalid_result_table",
        `${relative(root, file)} table must declare key as the primary key`,
        2,
      );
    }
    if (!/\bupdatedAt\s*:\s*[^,\n]+\.notNull\s*\(/.test(source)) {
      throw new AppError(
        "invalid_result_table",
        `${relative(root, file)} table must declare non-null updatedAt`,
        2,
      );
    }
  }
}

type CompilerToken = { kind: SyntaxKind; text: string; value: string; start: number; end: number };

function compilerTokens(source: string): CompilerToken[] {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const tokens: CompilerToken[] = [];
  while (true) {
    const kind = scanner.scan();
    if (kind === SyntaxKind.EndOfFile) break;
    tokens.push({
      kind,
      text: scanner.getTokenText(),
      value: scanner.getTokenValue(),
      start: scanner.getTokenStart(),
      end: scanner.getTokenEnd(),
    });
  }
  return tokens;
}

function functionBodies(source: string, tokens: CompilerToken[]) {
  const bodies: { name: string; directive?: string; body: string }[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind !== SyntaxKind.FunctionKeyword) continue;
    const name = tokens[index + 1];
    if (!name || name.kind !== SyntaxKind.Identifier) continue;
    const openIndex = tokens.findIndex(
      (token, candidate) => candidate > index && token.kind === SyntaxKind.OpenBraceToken,
    );
    if (openIndex < 0) continue;
    let depth = 0;
    let closeIndex = -1;
    for (let candidate = openIndex; candidate < tokens.length; candidate += 1) {
      if (tokens[candidate].kind === SyntaxKind.OpenBraceToken) depth += 1;
      if (tokens[candidate].kind === SyntaxKind.CloseBraceToken) depth -= 1;
      if (depth === 0) {
        closeIndex = candidate;
        break;
      }
    }
    if (closeIndex < 0) continue;
    const first = tokens[openIndex + 1];
    bodies.push({
      name: name.text,
      directive: first?.kind === SyntaxKind.StringLiteral ? first.value : undefined,
      body: source.slice(tokens[openIndex].start, tokens[closeIndex].end),
    });
    index = closeIndex;
  }
  return bodies;
}

function versionWarnings(packageJson: any): string[] {
  const expected = packageJson.gtm?.validatedAgainst ?? {};
  const actual = {
    workflow: packageJson.dependencies?.workflow,
    nitro: packageJson.dependencies?.nitro,
    drizzleKit: packageJson.devDependencies?.["drizzle-kit"],
    node: process.versions.node.split(".")[0],
  };
  return Object.entries(expected).flatMap(([name, version]) =>
    String(actual[name as keyof typeof actual]) === String(version)
      ? []
      : [`${name} validated against ${version}, installed ${actual[name as keyof typeof actual] ?? "missing"}`],
  );
}

async function validateMigrationArtifacts() {
  const directory = join(root, "drizzle");
  const migrationFiles = (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const journalPath = join(directory, "meta", "_journal.json");
  let journal: any;
  try {
    journal = JSON.parse(await readFile(journalPath, "utf8"));
  } catch {
    throw new AppError(
      "invalid_migration_artifacts",
      "drizzle/meta/_journal.json is missing or invalid",
      2,
    );
  }
  if (!Array.isArray(journal.entries)) {
    throw new AppError(
      "invalid_migration_artifacts",
      "drizzle/meta/_journal.json must contain an entries array",
      2,
    );
  }
  const tags = new Set<string>(
    journal.entries.flatMap((entry: any) =>
      entry && typeof entry.tag === "string" ? [entry.tag] : [],
    ),
  );
  const files = new Set(migrationFiles.map((file) => basename(file, ".sql")));
  for (const tag of tags) {
    if (!files.has(tag)) {
      throw new AppError(
        "invalid_migration_artifacts",
        `Drizzle journal entry ${tag} has no matching migration SQL`,
        2,
      );
    }
  }
  for (const file of migrationFiles) {
    const tag = basename(file, ".sql");
    const sequence = /^(\d{4})_.+/.exec(tag)?.[1];
    if (!sequence || !tags.has(tag)) {
      throw new AppError(
        "invalid_migration_artifacts",
        `${file} is not registered in drizzle/meta/_journal.json; generate migrations with db:generate`,
        2,
      );
    }
    const sql = await readFile(join(directory, file), "utf8");
    const visibleSql = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
    const destructive = visibleSql.match(
      /\b(?:delete|update|rename|drop)\b|\bcreate\s+trigger\b/i,
    );
    if (destructive) {
      throw new AppError(
        "destructive_migration",
        `${file} contains destructive SQL (${destructive[0].toUpperCase()})`,
        2,
      );
    }
    const changesSchema = /\b(?:create|alter|drop)\s+(?:table|index|view|trigger)\b/i.test(
      visibleSql,
    );
    if (changesSchema && !existsSync(join(directory, "meta", `${sequence}_snapshot.json`))) {
      throw new AppError(
        "invalid_migration_artifacts",
        `${file} has no matching drizzle/meta/${sequence}_snapshot.json`,
        2,
      );
    }
  }
}

async function poll(
  origin: string,
  identifier: string,
  seconds: number,
  previousApprovalToken?: string,
) {
  const deadline = Date.now() + seconds * 1_000;
  while (true) {
    const row = await request(new URL(`/api/runs/${encodeURIComponent(identifier)}`, origin), {
      headers: authHeaders(),
    });
    const newApproval = row.status === "waiting" && (
      previousApprovalToken === undefined || row.approval?.token !== previousApprovalToken
    );
    if (terminal(row.status) || newApproval) return withRunState(row, false);
    if (Date.now() >= deadline) return withRunState(row, true);
    await delay(500);
  }
}

function withRunState(row: any, stillActive: boolean) {
  const waitingReason = waitingReasonFor(row);
  const state = {
    ...row,
    still_active: stillActive || !terminal(row.status),
    ...(waitingReason ? { waiting_reason: waitingReason } : {}),
  };
  if (row.status !== "waiting") return state;
  if (row.approval?.token) {
    return {
      ...state,
      operatorCommand: `npm run gtm -- approve ${row.approval.token} --yes --wait 30`,
    };
  }
  return state;
}

function waitingReasonFor(row: any): string | undefined {
  if (row.status === "cancelling") return "cancelling";
  if (row.status === "running") {
    const step = row.ledger_summary?.activeStep ?? row.failedStep ?? row.failed_step;
    return step ? `step running (${step})` : "step running";
  }
  if (row.status !== "waiting") return undefined;
  const stage = row.approval?.stage;
  if (stage === "checkpoint") {
    return `checkpoint pending after ${Number(row.completed ?? 0) + Number(row.failed ?? 0)} rows`;
  }
  if (stage) return `approval pending (stage ${stage})`;
  if (row.trigger_token ?? row.triggerToken) return "step running (wait for trigger)";
  return "step running";
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
  throw new AppError(code, redact(payload?.error?.message ?? response.statusText), exitCode);
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
  const files = (await walk(join(root, "lib"), (file) => file.endsWith(".ts")))
    .concat(await walk(join(root, "server", "api"), (file) => file.endsWith(".ts")))
    .concat([
    join(root, "scripts", "gtm.ts"),
    join(root, "scripts", "migrate-cloud.ts"),
    join(root, "scripts", "verify-migrations.ts"),
    join(root, "drizzle.config.ts"),
    join(root, "nitro.config.ts"),
  ]);
  return files.sort();
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

async function writeRowsFromRunInput(
  slug: string,
  identifier: string,
  only: string,
  flags: Flags,
) {
  if (!new Set(["failed", "empty", "remaining", "all"]).has(only)) {
    throw new AppError("invalid_selection", "--only must be failed, empty, remaining, or all", 2);
  }
  await configureReadOnly(flags);
  const source = (
    await executeReadOnly(
      `select run_key, workflow, input, status, remaining_keys from workflow_runs where run_key = ${sqlLiteral(identifier)} or run_id = ${sqlLiteral(identifier)} limit 1`,
    )
  )[0];
  if (!source) throw new AppError("not_found", `Unknown run ${identifier}`, 6);
  if (source.workflow !== slug) {
    throw new AppError(
      "workflow_mismatch",
      `Run ${identifier} belongs to ${String(source.workflow)}, not ${slug}`,
      2,
    );
  }
  const body = JSON.parse(String(source.input));
  if (!Array.isArray(body?.rows)) {
    throw new AppError("invalid_source_run", `Run ${identifier} has no rows input`, 2);
  }
  let keys: string[];
  if (only === "all") {
    keys = body.rows.flatMap((row: any) => typeof row?.key === "string" ? [row.key] : []);
  } else if (only === "remaining") {
    if (source.status !== "stopped") {
      throw new AppError("invalid_source_run", "--only remaining requires a stopped source run", 2);
    }
    keys = JSON.parse(String(source.remaining_keys ?? "[]"));
  } else {
    const status = only === "failed" ? "error" : "empty";
    const rows = await executeReadOnly(
      `select distinct row_key from enrichment_runs where run_key = ${sqlLiteral(String(source.run_key))} and status = ${sqlLiteral(status)} and row_key is not null order by created_at, row_key`,
    );
    keys = rows.map((row) => String(row.row_key));
  }
  const selected = new Set(keys);
  const rows = body.rows.filter((row: any) => typeof row?.key === "string" && selected.has(row.key));
  if (rows.length !== selected.size) {
    throw new AppError(
      "missing_source_rows",
      `The source input is missing ${selected.size - rows.length} selected row keys`,
      2,
    );
  }
  const safeRunKey = String(source.run_key).replace(/[^A-Za-z0-9._-]/g, "_");
  const directory = join(root, "data", "reruns");
  const path = join(directory, `${slug}-${safeRunKey}-${only}.json`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, `${JSON.stringify({ ...body, rows }, null, 2)}\n`, { mode: 0o600 });
  return path;
}

async function failedRunRows(runKey: string) {
  return executeReadOnly(
    `select er.row_key as key, coalesce(er.step, wr.failed_step) as step, er.provider, er.endpoint, er.error from enrichment_runs er join workflow_runs wr on wr.run_key = er.run_key where er.run_key = ${sqlLiteral(runKey)} and er.status = 'error' order by er.created_at, er.id`,
  );
}

async function configureReadOnly(flags: Flags) {
  let databaseUrl = process.env.TURSO_DATABASE_URL?.trim();
  let readOnlyToken = process.env.TURSO_READ_ONLY_AUTH_TOKEN?.trim();
  if (flags.cloud) {
    const path = join(root, ".env.turso");
    if (!existsSync(path)) {
      throw new AppError("missing_cloud_env", ".env.turso is required with --cloud", 2);
    }
    const values = parseEnv(await readFile(path, "utf8"));
    databaseUrl = values.TURSO_DATABASE_URL?.trim();
    readOnlyToken = values.TURSO_READ_ONLY_AUTH_TOKEN?.trim();
  }
  if (flags.cloud && !databaseUrl) {
    throw new AppError("missing_cloud_url", "TURSO_DATABASE_URL is required with --cloud", 2);
  }
  if (!databaseUrl || databaseUrl.startsWith("file:")) return;
  if (!readOnlyToken) {
    throw new AppError(
      "missing_read_only_token",
      "TURSO_READ_ONLY_AUTH_TOKEN is required for remote read-only commands; the write token is never used.",
      2,
    );
  }
  process.env.TURSO_DATABASE_URL = databaseUrl;
  process.env.TURSO_AUTH_TOKEN = readOnlyToken;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function headerValue(source: string, name: string) {
  return source.match(new RegExp(`^\\s*\\*\\s+${name}:\\s*(.+)$`, "mi"))?.[1].trim();
}

function listHeader(source: string, name: string, fallback: RegExp) {
  const documented = headerValue(source, name) ?? (name === "Environment" ? headerValue(source, "Env") : undefined);
  const values = documented
    ? documented.split(",").map((value) => value.trim()).filter(Boolean)
    : [...source.matchAll(fallback)].map((match) => match[1]);
  return [...new Set(values)].sort();
}

function workflowImportsProvider(source: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`from\\s+["'][^"']*\\/providers\\/${escaped}(?:\\.ts)?["']`).test(source);
}

function stepNames(source: string) {
  return [...source.matchAll(/async function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{\s*["']use step["']/g)].map(
    (match) => match[1],
  );
}

async function diagramOverlay(slug: string, runKey: string, stages: string[]): Promise<DiagramOverlay> {
  const run = (
    await executeReadOnly(
      `select run_key, workflow, status, failed_step from workflow_runs where run_key = ${sqlLiteral(runKey)} or run_id = ${sqlLiteral(runKey)} limit 1`,
    )
  )[0];
  if (!run) throw new AppError("not_found", `Unknown run ${runKey}`, 6);
  if (run.workflow !== slug) {
    throw new AppError("workflow_mismatch", `Run ${runKey} belongs to ${String(run.workflow)}, not ${slug}`, 2);
  }
  const ledger = await executeReadOnly(
    `select step, status, coalesce(sum(cost_usd), 0) as cost_usd from enrichment_runs where run_key = ${sqlLiteral(String(run.run_key))} and step is not null group by step, status order by step, status`,
  );
  const byStep = new Map<string, { statuses: Set<string>; costUsd: number }>();
  for (const row of ledger) {
    const name = String(row.step);
    const current = byStep.get(name) ?? { statuses: new Set<string>(), costUsd: 0 };
    current.statuses.add(String(row.status));
    current.costUsd += Number(row.cost_usd ?? 0);
    byStep.set(name, current);
  }
  const failedIndex = stages.indexOf(String(run.failed_step ?? ""));
  const overlay: DiagramOverlay = new Map();
  for (const [index, stage] of stages.entries()) {
    const ledgerStep = byStep.get(stage);
    let status: DiagramStatus = "pending";
    if (ledgerStep?.statuses.has("error") || ledgerStep?.statuses.has("lost") || index === failedIndex) status = "failed";
    else if (run.status === "completed") status = "done";
    else if (ledgerStep?.statuses.has("pending")) status = "active";
    else if (ledgerStep || failedIndex > index) status = "done";
    else if (["running", "waiting", "cancelling"].includes(String(run.status)) && index === 0) status = "active";
    overlay.set(stage, { status, costUsd: ledgerStep?.costUsd ?? -1 });
  }
  return overlay;
}

function mermaidDiagram(stages: string[], overlay?: DiagramOverlay) {
  const lines = ["flowchart TD", '  rows["Rows"]'];
  stages.forEach((stage, index) => lines.push(`  step${index}["${diagramLabel(stage, overlay)}"]`));
  if (stages.length > 0) {
    lines.push("  rows --> step0");
    for (let index = 1; index < stages.length; index += 1) lines.push(`  step${index - 1} --> step${index}`);
    lines.push(`  step${stages.length - 1} -. "next row" .-> step0`);
  }
  return lines.join("\n");
}

function asciiDiagram(stages: string[], overlay?: DiagramOverlay) {
  const lines = ["Rows"];
  for (const stage of stages) lines.push("  |", "  v", diagramLabel(stage, overlay));
  if (stages.length > 0) lines.push(`  +-- next row --> ${humanize(stages[0])}`);
  return lines.join("\n");
}

function diagramLabel(stage: string, overlay?: DiagramOverlay) {
  const item = overlay?.get(stage);
  const marker = item
    ? { done: "[x]", failed: "[!]", active: "[~]", pending: "[ ]" }[item.status]
    : "";
  const cost = item && item.costUsd >= 0 ? ` ($${item.costUsd.toFixed(2)})` : "";
  return `${marker ? `${marker} ` : ""}${humanize(stage)}${cost}`;
}

function humanize(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
}

function workflowPath(file: string) {
  return relative(join(root, "workflows"), file).slice(0, -3).split(sep).join("/");
}

async function loadWorkflow(file: string, body: unknown) {
  let loaded: any;
  try {
    loaded = await import(`${pathToFileURL(file).href}?gtm-dry-run=${Date.now()}`);
  } catch (caught) {
    throw new AppError("invalid_workflow", `Cannot import ${relative(root, file)}: ${redact(caught)}`, 2);
  }
  if (!loaded.input?.safeParse) {
    throw new AppError("invalid_workflow", `${relative(root, file)} must export a Zod input schema`, 2);
  }
  const parsed = loaded.input.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "invalid_input_schema",
      parsed.error.issues
        .map((issue: any) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; "),
      2,
    );
  }
  for (const name of ["MAX_ROWS", "COST_PER_ROW_USD", "MAX_SPEND_USD"]) {
    if (!Number.isFinite(loaded[name])) {
      throw new AppError("invalid_workflow", `${relative(root, file)} must export numeric ${name}`, 2);
    }
  }
  return {
    input: parsed.data,
    maxRows: Number(loaded.MAX_ROWS),
    costPerRowUsd: Number(loaded.COST_PER_ROW_USD),
    maxSpendUsd: Number(loaded.MAX_SPEND_USD),
  };
}

async function runSummary(row: any) {
  const ledger = row.ledger_summary ?? {};
  const resultCounts = row.result?.counts;
  const success = Number(resultCounts?.success ?? ledger.success ?? 0);
  const empty = Number(resultCounts?.empty ?? ledger.empty ?? 0);
  const foundTotal = success + empty;
  const hitRate = foundTotal === 0 ? 0 : Math.round((success / foundTotal) * 100);
  const actualCostUsd = Number(row.costUsd ?? row.cost_usd ?? 0);
  let estimatedCostUsd: number | null = null;
  try {
    const workflow = (await workflowFiles()).find(
      (file) => workflowPath(file) === row.path || basename(file, ".ts") === row.workflow,
    );
    if (workflow && row.input) {
      const loaded = await loadWorkflow(workflow, row.input);
      const rows = Array.isArray(loaded.input?.rows) ? loaded.input.rows.length : 1;
      estimatedCostUsd = rows * loaded.costPerRowUsd;
    }
  } catch {
    estimatedCostUsd = null;
  }
  const differenceReason = costDifferenceReason(row, estimatedCostUsd, actualCostUsd);
  return {
    ...row,
    receipt: {
      success,
      empty,
      hit_rate: { found: success, total: foundTotal, percent: hitRate },
      cache_hits: Number(ledger.cacheHits ?? 0),
      estimated_cost_usd: estimatedCostUsd,
      actual_cost_usd: actualCostUsd,
      cost_sources: row.cost_sources ?? ledger.costSources ?? [],
      ...(differenceReason ? { estimate_difference_reason: differenceReason } : {}),
    },
  };
}

function costDifferenceReason(row: any, estimated: number | null, actual: number) {
  if (!terminal(row.status) || estimated === null || estimated <= 0 || Math.abs(actual - estimated) / estimated <= 0.2) {
    return undefined;
  }
  if (Number(row.ledger_summary?.cacheHits ?? 0) > 0) return "cache hits cost $0";
  if (row.status !== "completed") return "the run stopped before full scope completed";
  if (
    actual < estimated &&
    (row.cost_sources ?? []).some((source: any) => source.source === "reported")
  ) {
    return "reported cost was lower than the fixed estimate";
  }
  return actual < estimated
    ? "actual cost was lower than the fixed estimate"
    : "actual cost exceeded the fixed estimate";
}

function runMarkdown(row: any) {
  const receipt = row.receipt;
  const sources = (receipt.cost_sources as any[]).length
    ? (receipt.cost_sources as any[])
        .map((source) => `${source.source} $${Number(source.costUsd ?? source.cost_usd ?? 0).toFixed(2)}`)
        .join(", ")
    : "none $0.00";
  const lines = [
    `${row.workflow} ${row.runKey}: ${row.status}`,
    `Rows: ${Number(row.completed ?? 0)} completed, ${Number(row.failed ?? 0)} failed, ${receipt.empty} empty`,
    `Hit rate: found ${receipt.hit_rate.found} of ${receipt.hit_rate.total} (${receipt.hit_rate.percent}%)`,
    `Cost: $${receipt.actual_cost_usd.toFixed(2)} actual${receipt.estimated_cost_usd === null ? "" : ` versus $${receipt.estimated_cost_usd.toFixed(2)} estimated`}; ${sources}; ${receipt.cache_hits} cache hits`,
  ];
  if (receipt.estimate_difference_reason) lines.push(`Difference: ${receipt.estimate_difference_reason}`);
  if (row.stopReason ?? row.stop_reason) lines.push(`Stop reason: ${row.stopReason ?? row.stop_reason}`);
  if (row.waiting_reason) lines.push(`Waiting: ${row.waiting_reason}`);
  lines.push(`Next: \`${nextRunCommand(row)}\``);
  if (Array.isArray(row.failed_rows)) {
    lines.push("", "Failed calls", "", toMarkdown(row.failed_rows));
  }
  return lines.join("\n");
}

function nextRunCommand(row: any) {
  if (row.approval?.token) return `npm run gtm -- approve ${row.approval.token} --yes --wait 30`;
  if (["running", "cancelling"].includes(row.status)) {
    return `npm run gtm -- runs get ${row.runKey} --wait 30 --format markdown`;
  }
  if ((row.stopReason ?? row.stop_reason) && (row.remaining_keys?.length ?? 0) > 0) {
    return `npm run gtm -- run ${row.workflow} --rows-from-run ${row.runKey} --only remaining --dry-run`;
  }
  if (Number(row.failed ?? 0) > 0) {
    return `npm run gtm -- runs get ${row.runKey} --failed --format markdown`;
  }
  return `npm run gtm -- diagram ${row.workflow} --run ${row.runKey}`;
}

async function deploymentHead(workflow: string, origin: string): Promise<string | undefined> {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  const source = await readFile(workflow, "utf8");
  if (header(source, "Runs") !== "on Vercel") return undefined;
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const recorded = packageJson.gtm?.vercel?.url;
  if (!recorded) return undefined;
  const recordedOrigin = new URL(recorded.startsWith("http") ? recorded : `https://${recorded}`).origin;
  if (new URL(origin).origin !== recordedOrigin) return undefined;

  const status = await commandOutput("git", ["status", "--porcelain"]);
  if (status.trim()) {
    throw new AppError(
      "deployment_workspace_dirty",
      "Refusing production start because the workspace has uncommitted changes.",
      2,
    );
  }
  const head = (await commandOutput("git", ["rev-parse", "HEAD"])).trim();
  const main = (await commandOutput("git", ["rev-parse", "origin/main"])).trim();
  if (head !== main) {
    throw new AppError(
      "deployment_head_not_pushed",
      "Refusing production start because HEAD is not the pushed origin/main commit.",
      2,
    );
  }
  return head;
}

function header(source: string, name: string) {
  const match = source.match(new RegExp(`^\\s*\\*\\s+${name}:\\s*(.+)$`, "m"));
  if (!match) throw new AppError("invalid_workflow", `Missing ${name}: header`, 2);
  return match[1].trim();
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

function waitSeconds(flags: Flags) {
  const raw = flags.wait === true ? "30" : stringFlag(flags, "wait");
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new AppError("invalid_wait", "--wait requires a non-negative number of seconds", 2);
  }
  return seconds;
}

function terminal(status: string) {
  return ["completed", "stopped", "timed_out", "failed", "cancelled"].includes(status);
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

async function commandOutput(executable: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise(stdout)
        : reject(new AppError("git_check_failed", redact(stderr) || `${executable} failed`, 2)),
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
  process.stdout.write(`${JSON.stringify(redactValue(value))}\n`);
}

function delay(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}
