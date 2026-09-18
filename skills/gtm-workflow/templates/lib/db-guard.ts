import type { Client, InStatement, InArgs, ResultSet, Transaction, TransactionMode } from "@libsql/client";

/**
 * The guard every database client passes through. Turso bills every row a query scans, so the guard plans each
 * statement, refuses full table scans in strict mode, and charges an estimate of rows read to a budget.
 * Settings live in gtm_settings, so the workspace owner changes them without a deploy (references/cost.md).
 */
export const guardSchemaSql = `
CREATE TABLE IF NOT EXISTS gtm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage_budget (scope TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, cap INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS guard_log (
 kind TEXT NOT NULL, scope TEXT NOT NULL, shape TEXT NOT NULL, tables TEXT NOT NULL, would_charge INTEGER NOT NULL,
 hits INTEGER NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL, PRIMARY KEY (kind, scope, shape)
);`;

/** Defaults for every owner-editable setting; a row in gtm_settings overrides one. */
export const settingDefaults = {
  guard_mode: process.env.GTM_GUARD_MODE === "warn" ? "warn" : "enforce",
  rows_per_run: "200000",
  rows_per_run_ceiling: "2000000",
  rows_per_conversation: "100000",
  rows_per_day_agent: "100000",
  rows_per_statement: "50000",
  rows_per_day_browsing: "1000000",
  rows_per_day_workspace: "5000000",
  spend_usd_per_day: "100",
} as const;
export type SettingKey = keyof typeof settingDefaults;
export type Settings = Record<SettingKey, string>;

export type GuardMode = "strict" | "interactive";
export type GuardContext = { mode: GuardMode; scope: string };
export type GuardOptions = GuardContext & {
  /** Resolved per statement; a workflow run overrides the static mode and scope. */
  resolve?: () => Promise<Partial<GuardContext> | undefined>;
};
export type GuardedClient = Client & {
  /** Write pending charges and warnings now; call before closing a short-lived client. */
  flush(): Promise<void>;
  /** Estimated rows the last statement was charged. */
  lastCharge(): number;
  /** Rows used and the cap for a scope, as last seen. */
  budget(scope?: string): Promise<{ scope: string; used: number; cap: number }>;
  /** Raise or lower this run's own cap, clamped to rows_per_run_ceiling. Returns the cap applied. */
  setRunBudget(rows: number, scope?: string): Promise<number>;
};

export class ScanRefusedError extends Error {
  override name = "ScanRefusedError";
}
export class BudgetExceededError extends Error {
  override name = "BudgetExceededError";
}

type Executor = Pick<Client, "execute">;
type Plan = { scans: string[]; json: boolean; offset: boolean };
type Usage = { used: number; pending: number; cap: number | null };
type Warning = { kind: string; scope: string; shape: string; tables: string; charge: number; hits: number };

const SKIP = /^\s*(PRAGMA|BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|CREATE|DROP|ALTER|EXPLAIN|VACUUM|ANALYZE|REINDEX|ATTACH|DETACH)\b/i;
const SETTINGS_TTL_MS = 60_000;
const SIZE_TTL_MS = 600_000;
const FLUSH_ROWS = 5_000;
const FLUSH_STATEMENTS = 50;
const FLUSH_MS = 5_000;
const JSON_FACTOR = 5;

const today = () => new Date().toISOString().slice(0, 10);
/** One cache entry per statement shape: parameter lists of any length plan the same. */
export const shapeOf = (sql: string) =>
  sql
    .replace(/\s+/g, " ")
    .replace(/\(\s*\?(?:\s*,\s*\?)*\s*\)/g, "(?)")
    .replace(/\(\?\)(?:\s*,\s*\(\?\))+/g, "(?)")
    .trim();
const bare = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');

type Token = { word: string; at: number };
/** Top-level keywords and placeholder positions; strings, quoted names, comments and parentheses are skipped. */
function outline(sql: string) {
  const words: Token[] = [];
  const marks: number[] = [];
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      for (i++; i < sql.length && (sql[i] !== ch || sql[i + 1] === ch); i++) if (sql[i] === ch) i++;
    } else if (ch === "[") i = Math.max(i, sql.indexOf("]", i));
    else if (ch === "-" && sql[i + 1] === "-") i = (sql.indexOf("\n", i) + 1 || sql.length) - 1;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "?") marks.push(i);
    else if (depth === 0 && /[A-Za-z_]/.test(ch)) {
      const word = /^\w+/.exec(sql.slice(i))![0];
      words.push({ word: word.toUpperCase(), at: i });
      i += word.length - 1;
    }
  }
  return { words, marks };
}

/**
 * What to plan for a statement. Reads plan as they are. A write plans as the read it implies, because the local
 * client cannot finish EXPLAIN of a write inside a transaction: UPDATE and DELETE as a SELECT with their WHERE,
 * INSERT ... SELECT as its SELECT. `scanAll` names a table an UPDATE or DELETE without WHERE rewrites whole.
 */
export function planTarget(sql: string, args: InArgs | undefined): { sql?: string; args?: InArgs; scanAll?: string } {
  const { words, marks } = outline(sql);
  const kind = words[0]?.word;
  const slice = (from: number, to: number, text: string) => ({
    sql: text,
    args: Array.isArray(args) ? args.slice(marks.filter((m) => m < from).length, marks.filter((m) => m < to).length) : args,
  });
  const next = (names: string[], after: number) => words.find((w) => w.at > after && names.includes(w.word));
  if (kind === "SELECT" || kind === "VALUES") return { sql, args };
  if (kind === "WITH") return next(["INSERT", "UPDATE", "DELETE", "REPLACE"], 0) ? {} : { sql, args };
  if (kind === "INSERT" || kind === "REPLACE") {
    const select = next(["SELECT"], 0);
    if (!select) return {};
    const conflict = words.find((w, i) => w.at > select.at && w.word === "ON" && words[i + 1]?.word === "CONFLICT");
    const end = Math.min(conflict?.at ?? sql.length, next(["RETURNING"], select.at)?.at ?? sql.length);
    return slice(select.at, end, sql.slice(select.at, end));
  }
  if (kind === "UPDATE" || kind === "DELETE") {
    const anchor = kind === "UPDATE" ? next(["SET"], 0) : next(["FROM"], 0);
    if (!anchor) return {};
    const where = next(["WHERE"], anchor.at);
    const rest = next(["RETURNING", "ORDER", "LIMIT"], anchor.at)?.at ?? sql.length;
    const table = (kind === "UPDATE" ? sql.slice(words[0].at + 6, anchor.at).replace(/^\s*OR\s+\w+/i, "") : sql.slice(anchor.at + 4, where?.at ?? rest)).trim();
    if (!where) return { scanAll: table.replace(/"/g, "").split(/\s+/)[0] };
    const from = kind === "UPDATE" ? words.find((w) => w.at > anchor.at && w.at < where.at && w.word === "FROM") : undefined;
    const end = next(["RETURNING", "ORDER", "LIMIT"], where.at)?.at ?? sql.length;
    const sources = from ? `, ${sql.slice(from.at + 4, where.at)}` : "";
    return slice(from?.at ?? where.at, end, `SELECT 1 FROM ${table}${sources} ${sql.slice(where.at, end)}`);
  }
  return {};
}

/** A full scan is any SCAN of something that is not a virtual table, a constant row or a subquery of this plan. */
export function readPlan(details: string[], sql: string): Plan {
  const derived = new Set<string>();
  for (const d of details) {
    const made = /^(?:MATERIALIZE|CO-ROUTINE) (\S+)/.exec(d);
    if (made) derived.add(made[1]);
  }
  const scans: string[] = [];
  let json = false;
  for (const d of details) {
    const scan = /^SCAN (\S+)(.*)$/.exec(d);
    if (!scan) continue;
    if (/VIRTUAL TABLE/.test(scan[2])) json = true;
    else if (!/CONSTANT ROW/.test(d) && !scan[1].startsWith("(") && !derived.has(scan[1])) scans.push(scan[1]);
  }
  return { scans, json, offset: /\bOFFSET\b/i.test(bare(sql)) };
}

const capSetting = (scope: string): SettingKey | null =>
  scope.startsWith("run:")
    ? "rows_per_run"
    : scope.startsWith("agent:")
      ? "rows_per_conversation"
      : scope.startsWith("agent-day:")
        ? "rows_per_day_agent"
        : scope.startsWith("browse:")
          ? "rows_per_day_browsing"
          : scope.startsWith("day:")
            ? "rows_per_day_workspace"
            : null;

export function guard(inner: Client, options: GuardOptions): GuardedClient {
  const plans = new Map<string, Plan>();
  const sizes = new Map<string, { rows: number; at: number }>();
  const usage = new Map<string, Usage>();
  const warnings = new Map<string, Warning>();
  let settings: Settings | undefined;
  let settingsAt = 0;
  let tableNames: string[] | undefined;
  let openTransactions = 0;
  let pendingStatements = 0;
  let flushedAt = Date.now();
  let lastCharge = 0;

  async function loadSettings(via: Executor): Promise<Settings> {
    if (settings && Date.now() - settingsAt < SETTINGS_TTL_MS) return settings;
    let rows: ResultSet["rows"];
    try {
      rows = (await via.execute("SELECT key, value FROM gtm_settings")).rows;
    } catch (error) {
      if (!/no such table/i.test(String(error))) throw error;
      // A workspace that has not migrated yet; the statements are idempotent. A read-only connection keeps defaults.
      for (const statement of guardSchemaSql.split(";").filter((s) => s.trim())) await via.execute(statement).catch(() => undefined);
      rows = [];
    }
    settings = { ...settingDefaults };
    for (const row of rows)
      if (Object.hasOwn(settingDefaults, String(row.key))) settings[String(row.key) as SettingKey] = String(row.value);
    settingsAt = Date.now();
    return settings;
  }

  async function loadUsage(via: Executor, scopes: string[]) {
    const missing = scopes.filter((s) => !usage.has(s));
    if (!missing.length) return;
    const found = await via
      .execute({
        sql: `SELECT scope, used, cap FROM usage_budget WHERE scope IN (${missing.map(() => "?").join(",")})`,
        args: missing,
      })
      .catch((error) => {
        if (/no such table/i.test(String(error))) return { rows: [] as ResultSet["rows"] };
        throw error;
      });
    for (const scope of missing) usage.set(scope, { used: 0, pending: 0, cap: null });
    for (const row of found.rows)
      usage.set(String(row.scope), { used: Number(row.used), pending: 0, cap: row.cap == null ? null : Number(row.cap) });
  }
  const capOf = (scope: string, s: Settings) => {
    const key = capSetting(scope);
    const own = usage.get(scope)?.cap;
    return own ?? (key ? Number(s[key]) : Infinity);
  };

  async function planOf(via: Executor, sql: string, args: InArgs | undefined): Promise<Plan> {
    const shape = shapeOf(sql);
    const known = plans.get(shape);
    if (known) return known;
    const target = planTarget(sql, args);
    const details = target.sql
      ? (await via.execute({ sql: `EXPLAIN QUERY PLAN ${target.sql}`, args: target.args ?? [] })).rows.map((r) => String(r.detail))
      : target.scanAll
        ? [`SCAN ${target.scanAll}`]
        : [];
    const plan = readPlan(details, sql);
    plans.set(shape, plan);
    return plan;
  }

  /** The plan prints an alias when the query has one; map it back to the table to size it and name it. */
  async function tablesOf(via: Executor, sql: string, names: string[]) {
    tableNames ??= (await via.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
    const real = new Set(tableNames);
    const aliases = new Map<string, string>();
    for (const m of bare(sql.replace(/"/g, "")).matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?|,\s*(\w+)\s+(?:AS\s+)?(\w+)/gi)) {
      const [table, alias] = m[1] ? [m[1], m[2]] : [m[3], m[4]];
      if (real.has(table)) aliases.set(alias ?? table, table).set(table, table);
    }
    return names.map((name) => ({ name, table: aliases.get(name) ?? (real.has(name) ? name : null) }));
  }
  async function sizeOf(via: Executor, table: string | null): Promise<number> {
    const known = table && sizes.get(table);
    if (known && Date.now() - known.at < SIZE_TTL_MS) return known.rows;
    let rows: number;
    try {
      if (!table) throw new Error("unknown table");
      rows = Number((await via.execute(`SELECT MAX(rowid) AS n FROM "${table.replace(/"/g, '""')}"`)).rows[0].n ?? 0);
    } catch {
      // No rowid to read: assume the largest table sized so far, never zero.
      rows = Math.max(1000, ...[...sizes.values()].map((s) => s.rows));
    }
    if (table) sizes.set(table, { rows, at: Date.now() });
    return rows;
  }

  function warn(kind: string, scope: string, shape: string, tables: string, charge: number, once = false) {
    const id = JSON.stringify([kind, scope, shape]);
    const prior = warnings.get(id);
    if (prior && once) return;
    warnings.set(id, { kind, scope, shape, tables, charge, hits: (prior?.hits ?? 0) + 1 });
  }
  const seen = new Set<string>();

  async function check(via: Executor, sql: string, args: InArgs | undefined) {
    if (SKIP.test(sql)) return undefined;
    const s = await loadSettings(via);
    const context = { mode: options.mode, scope: options.scope, ...(await options.resolve?.()) };
    const enforce = s.guard_mode !== "warn";
    const day = `day:${today()}`;
    await loadUsage(via, [context.scope, day]);
    for (const scope of [context.scope, day]) {
      const u = usage.get(scope)!;
      const cap = capOf(scope, s);
      if (u.used + u.pending < cap) continue;
      const setting = scope === context.scope && u.cap != null ? "maxRowsRead" : capSetting(scope);
      const message = `Row-read budget spent for ${scope}: ${u.used + u.pending} of ${cap} estimated rows. The workspace owner can raise "${setting}" in gtm_settings (PUT /api/settings), and a run can pass maxRowsRead up to rows_per_run_ceiling. See references/cost.md.`;
      if (enforce) throw new BudgetExceededError(message);
      if (!seen.has(`budget:${scope}`)) warn("budget", scope, `over ${cap}`, "", u.used + u.pending, true);
      seen.add(`budget:${scope}`);
    }
    const plan = await planOf(via, sql, args);
    let scanned = 0;
    let tables = "";
    if (plan.scans.length) {
      const resolved = await tablesOf(via, sql, plan.scans);
      tables = [...new Set(resolved.map((r) => r.table ?? r.name))].join(",");
      for (const r of resolved) scanned += (await sizeOf(via, r.table)) * (plan.json ? JSON_FACTOR : 1);
      if (context.mode === "strict") {
        const named = resolved.map((r) => (r.table && r.table !== r.name ? `${r.table} (as ${r.name})` : (r.table ?? r.name))).join(", ");
        const message = `Query scans ${named}. In a workflow or runtime code every query must be an index search, because Turso bills every row scanned. Use nextBatch, companiesOf or progressCounts from lib/profiles/population.ts, filter through profile_memberships or person_companies, or add an index in a migration. See references/cost.md. SQL: ${shapeOf(sql).slice(0, 300)}`;
        if (enforce) throw new ScanRefusedError(message);
        warn("scan", context.scope, shapeOf(sql), tables, scanned + 1);
      } else if (scanned > Number(s.rows_per_statement)) {
        const message = `This statement would scan about ${scanned} rows of ${tables}, above rows_per_statement (${s.rows_per_statement}). Filter through an indexed column, profile_memberships or person_companies, or ask the workspace owner to raise rows_per_statement in gtm_settings. See references/cost.md.`;
        if (enforce) throw new BudgetExceededError(message);
        warn("statement", context.scope, shapeOf(sql), tables, scanned);
      }
    }
    if (plan.offset && context.mode === "strict") {
      const message = `OFFSET paging re-reads every skipped row on each page. Page by key instead (WHERE key > ? ORDER BY key LIMIT ?), or use nextBatch from lib/profiles/population.ts. SQL: ${shapeOf(sql).slice(0, 300)}`;
      if (enforce) throw new ScanRefusedError(message);
      warn("offset", context.scope, shapeOf(sql), tables, 0);
    }
    return { scanned, scopes: [context.scope, day] };
  }

  function charge(checked: Awaited<ReturnType<typeof check>>, result: ResultSet) {
    if (!checked) return;
    // Never zero: an empty lookup still costs a round trip, and a loop of them must still run into its budget.
    lastCharge = Math.max(1, checked.scanned + result.rows.length);
    for (const scope of checked.scopes) usage.get(scope)!.pending += lastCharge;
    pendingStatements++;
  }

  async function flush() {
    if (openTransactions) return;
    const now = new Date().toISOString();
    for (const [scope, u] of usage) {
      if (!u.pending) continue;
      const pending = u.pending;
      u.pending = 0;
      const saved = await inner.execute({
        sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?,?,NULL,?) ON CONFLICT(scope) DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at RETURNING used, cap",
        args: [scope, pending, now],
      });
      u.used = Number(saved.rows[0].used);
      u.cap = saved.rows[0].cap == null ? null : Number(saved.rows[0].cap);
    }
    for (const w of warnings.values())
      await inner.execute({
        sql: "INSERT INTO guard_log (kind, scope, shape, tables, would_charge, hits, first_at, last_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(kind, scope, shape) DO UPDATE SET hits = hits + excluded.hits, would_charge = excluded.would_charge, last_at = excluded.last_at",
        args: [w.kind, w.scope, w.shape.slice(0, 2000), w.tables, w.charge, w.hits, now, now],
      });
    warnings.clear();
    pendingStatements = 0;
    flushedAt = Date.now();
  }
  async function maybeFlush() {
    const rows = [...usage.values()].reduce((n, u) => Math.max(n, u.pending), 0);
    if (rows >= FLUSH_ROWS || pendingStatements >= FLUSH_STATEMENTS || (pendingStatements && Date.now() - flushedAt > FLUSH_MS))
      await flush().catch(() => undefined);
  }

  const statementOf = (statement: InStatement | string, args?: InArgs) =>
    typeof statement === "string" ? { sql: statement, args } : { sql: statement.sql, args: statement.args };

  async function run<T extends Executor>(via: T, statement: InStatement | string, args?: InArgs) {
    const s = statementOf(statement, args);
    const checked = await check(via, s.sql, s.args);
    const result = await via.execute(s.args ? { sql: s.sql, args: s.args } : s.sql);
    charge(checked, result);
    return result;
  }
  async function runBatch(via: Executor, statements: (InStatement | string)[]) {
    const checked: Awaited<ReturnType<typeof check>>[] = [];
    for (const statement of statements) {
      const s = statementOf(statement);
      checked.push(await check(via, s.sql, s.args));
    }
    return (results: ResultSet[]) => results.forEach((r, i) => charge(checked[i], r));
  }

  function guardTransaction(tx: Transaction): Transaction {
    let open = true;
    const done = async () => {
      if (!open) return;
      open = false;
      openTransactions--;
      await maybeFlush();
    };
    return new Proxy(tx, {
      get(target, property) {
        if (property === "execute") return (statement: InStatement) => run(target, statement);
        if (property === "batch")
          return async (statements: InStatement[]) => {
            const settle = await runBatch(target, statements);
            const results = await target.batch(statements);
            settle(results);
            return results;
          };
        if (property === "commit" || property === "rollback")
          return async () => {
            try {
              await target[property]();
            } finally {
              await done();
            }
          };
        if (property === "close")
          return () => {
            target.close();
            void done();
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  const extra = {
    async execute(statement: InStatement | string, args?: InArgs) {
      const result = await run(inner, statement, args);
      await maybeFlush();
      return result;
    },
    async batch(statements: InStatement[], mode?: TransactionMode) {
      const settle = await runBatch(inner, statements);
      const results = await inner.batch(statements, mode);
      settle(results);
      await maybeFlush();
      return results;
    },
    async transaction(mode?: TransactionMode) {
      const tx = await inner.transaction(mode as TransactionMode);
      openTransactions++;
      return guardTransaction(tx);
    },
    /** Short-lived clients are closed without awaiting; pending charges are written first. */
    close() {
      void flush()
        .catch(() => undefined)
        .finally(() => inner.close());
    },
    flush,
    lastCharge: () => lastCharge,
    async budget(scope?: string) {
      const s = await loadSettings(inner);
      const name = scope ?? { scope: options.scope, ...(await options.resolve?.()) }.scope;
      await loadUsage(inner, [name]);
      const u = usage.get(name)!;
      return { scope: name, used: u.used + u.pending, cap: capOf(name, s) };
    },
    async setRunBudget(rows: number, scope?: string) {
      const s = await loadSettings(inner);
      const name = scope ?? { scope: options.scope, ...(await options.resolve?.()) }.scope;
      if (!Number.isFinite(rows) || rows <= 0) throw new Error("maxRowsRead must be a positive number");
      const cap = Math.min(Math.floor(rows), Number(s.rows_per_run_ceiling));
      await inner.execute({
        sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?,0,?,?) ON CONFLICT(scope) DO UPDATE SET cap = excluded.cap, updated_at = excluded.updated_at",
        args: [name, cap, new Date().toISOString()],
      });
      await loadUsage(inner, [name]);
      usage.get(name)!.cap = cap;
      return cap;
    },
  };
  return new Proxy(inner, {
    get(target, property) {
      if (Object.hasOwn(extra, property)) return extra[property as keyof typeof extra];
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as GuardedClient;
}
