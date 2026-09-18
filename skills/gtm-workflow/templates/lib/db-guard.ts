import type { Client, InStatement, InArgs, ResultSet, Transaction, TransactionMode } from "@libsql/client";

/**
 * The guard every database client passes through. Turso bills every row a query scans, so the guard plans each
 * statement, refuses full table scans in strict mode, and charges an estimate of rows read to a budget.
 * Settings live in gtm_settings, so the workspace owner changes them without a deploy (references/cost.md).
 */
export const guardSchemaSql = `
CREATE TABLE IF NOT EXISTS gtm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS usage_budget (scope TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0, cap INTEGER, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings_log (at TEXT NOT NULL, key TEXT NOT NULL, old_value TEXT NOT NULL, new_value TEXT NOT NULL, credential TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS settings_log_at ON settings_log (at);
CREATE TABLE IF NOT EXISTS guard_log (
 kind TEXT NOT NULL, scope TEXT NOT NULL, shape TEXT NOT NULL, tables TEXT NOT NULL, would_charge INTEGER NOT NULL,
 hits INTEGER NOT NULL, first_at TEXT NOT NULL, last_at TEXT NOT NULL, PRIMARY KEY (kind, scope, shape)
);
CREATE INDEX IF NOT EXISTS guard_log_last_at ON guard_log (last_at);`;

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
  /**
   * Where statements are planned. The local file client never finishes an EXPLAIN statement, so a connection that
   * plans and then reads keeps a read lock and blocks every other connection's write. A local file therefore plans
   * on a connection of its own that reads no data (lib/db.ts). Unset plans on the client itself, which is right for
   * Turso and for an in-memory database.
   */
  planner?: Pick<Client, "execute">;
  /** Shared by every client of one database in a process, so plans are made once and small charges are written together. */
  state?: GuardState;
};
export type GuardedClient = Client & {
  /** Write pending charges and warnings now; a route calls it before it answers. */
  flush(): Promise<void>;
  /** Write them only once enough has gathered; what a short-lived client does when it closes. */
  settle(): Promise<void>;
  /** Estimated rows the last statement was charged. */
  lastCharge(): number;
  /** Rows used and the cap for a scope, as last seen. */
  budget(scope?: string): Promise<{ scope: string; used: number; cap: number }>;
  /** Raise or lower this run's own cap, clamped to rows_per_run_ceiling. Returns the cap applied. */
  setRunBudget(rows: number, scope?: string): Promise<number>;
};

/** `fatal` tells the workflow engine not to retry the step: the same statement would be refused again. */
export class ScanRefusedError extends Error {
  override name = "ScanRefusedError";
  fatal = true;
}
export class BudgetExceededError extends Error {
  override name = "BudgetExceededError";
  fatal = true;
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

type Range = [number, number];
type Target = { sql: string; args: InArgs | undefined };

/** Parenthesised SELECTs inside a region of the statement, outermost only; strings are skipped. */
function subselects(sql: string, [from, to]: Range): Range[] {
  const found: Range[] = [];
  const skipString = (i: number) => {
    const quote = sql[i];
    for (i++; i < to && (sql[i] !== quote || sql[i + 1] === quote); i++) if (sql[i] === quote) i++;
    return i;
  };
  for (let i = from; i < to; i++) {
    if (sql[i] === "'" || sql[i] === '"' || sql[i] === "`") i = skipString(i);
    else if (sql[i] === "(" && /^\s*(SELECT|WITH)\b/i.test(sql.slice(i + 1, i + 40))) {
      let depth = 1;
      let j = i + 1;
      for (; j < to && depth; j++) {
        if (sql[j] === "'" || sql[j] === '"' || sql[j] === "`") j = skipString(j);
        else if (sql[j] === "(") depth++;
        else if (sql[j] === ")") depth--;
      }
      found.push([i + 1, j - 1]);
      i = j - 1;
    }
  }
  return found;
}

/** The statement's write keyword, also behind a leading WITH; undefined for a read. Strings cannot fool it. */
const writeWord = (words: Token[]) =>
  words[0]?.word === "WITH"
    ? words.find((w) => ["INSERT", "UPDATE", "DELETE", "REPLACE"].includes(w.word))
    : ["INSERT", "UPDATE", "DELETE", "REPLACE"].includes(words[0]?.word ?? "")
      ? words[0]
      : undefined;
export const isWrite = (sql: string) => writeWord(outline(sql).words) !== undefined;

/**
 * What to plan for a statement. Reads plan as they are. A write plans as the reads it implies, because the local
 * client cannot finish EXPLAIN of a write inside a transaction: UPDATE and DELETE as a SELECT with their WHERE,
 * INSERT ... SELECT as its SELECT, each with a leading WITH kept, and every subquery in the parts left out (VALUES,
 * SET, ON CONFLICT) on its own. `scanAll` names a table an UPDATE or DELETE without WHERE rewrites whole.
 */
export function planTarget(sql: string, args: InArgs | undefined): { targets: Target[]; scanAll?: string } {
  const { words, marks } = outline(sql);
  const next = (names: string[], after: number) => words.find((w) => w.at > after && names.includes(w.word));
  const pick = (text: string, ranges: Range[]): Target => ({
    sql: text,
    args: Array.isArray(args)
      ? args.filter((_, i) => ranges.some(([from, to]) => marks[i] >= from && marks[i] < to))
      : args && Object.fromEntries(Object.entries(args).filter(([name]) => new RegExp(`[:@$]${name.replace(/^[:@$]/, "")}\\b`).test(text))),
  });
  const first = words[0];
  if (!first) return { targets: [] };
  const write = writeWord(words);
  if (first.word === "SELECT" || first.word === "VALUES" || (first.word === "WITH" && !write)) return { targets: [{ sql, args }] };
  if (!write) return { targets: [] };
  const prefix: Range = [0, write === first ? 0 : write.at];
  const lead = sql.slice(...prefix);
  const targets: Target[] = [];
  const dropped: Range[] = [];
  let scanAll: string | undefined;
  if (write.word === "INSERT" || write.word === "REPLACE") {
    const select = next(["SELECT"], write.at);
    const conflict = words.find((w, i) => w.at > (select ?? write).at && w.word === "ON" && words[i + 1]?.word === "CONFLICT");
    const end = Math.min(conflict?.at ?? sql.length, next(["RETURNING"], (select ?? write).at)?.at ?? sql.length);
    if (select) targets.push(pick(lead + sql.slice(select.at, end), [prefix, [select.at, end]]));
    dropped.push([write.at, select?.at ?? end], [end, sql.length]);
  } else if (write.word === "UPDATE" || write.word === "DELETE") {
    const anchor = write.word === "UPDATE" ? next(["SET"], write.at) : next(["FROM"], write.at);
    if (!anchor) return { targets: [] };
    const where = next(["WHERE"], anchor.at);
    const rest = next(["RETURNING", "ORDER", "LIMIT"], (where ?? anchor).at)?.at ?? sql.length;
    const table = (write.word === "UPDATE" ? sql.slice(write.at + 6, anchor.at).replace(/^\s*OR\s+\w+/i, "") : sql.slice(anchor.at + 4, where?.at ?? rest)).trim();
    const from = write.word === "UPDATE" ? words.find((w) => w.at > anchor.at && w.at < (where?.at ?? rest) && w.word === "FROM") : undefined;
    const setRegion: Range = [anchor.at, from?.at ?? where?.at ?? rest];
    if (!where) {
      scanAll = table.replace(/"/g, "").split(/\s+/)[0];
      if (write.word === "UPDATE") dropped.push(setRegion);
    } else {
      // SET subqueries join the synthetic SELECT, so one that refers to the updated row still resolves.
      const inSet = write.word === "UPDATE" ? subselects(sql, setRegion) : [];
      const sources = from ? `, ${sql.slice(from.at + 4, where.at)}` : "";
      const columns = inSet.map((r) => `, (${sql.slice(...r)})`).join("");
      targets.push(pick(`${lead}SELECT 1${columns} FROM ${table}${sources} ${sql.slice(where.at, rest)}`, [prefix, ...inSet, [from?.at ?? where.at, rest]]));
    }
    dropped.push([rest, sql.length]);
  }
  for (const region of dropped)
    for (const sub of subselects(sql, region)) targets.push(pick(lead + sql.slice(...sub), [prefix, sub]));
  return { targets, scanAll };
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
  const text = bare(sql);
  return { scans, json, offset: /\bOFFSET\b/i.test(text) || /\bLIMIT\s+[^,()\s]+\s*,/i.test(text) };
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

export type GuardState = ReturnType<typeof createGuardState>;
/**
 * What clients of one database share in a process: plans, table sizes, settings, and charges not yet written. A
 * step opens a client, runs a few statements and closes it; without this each would plan again and write its own
 * budget rows. At most one flush threshold of charges is lost when a server instance is frozen.
 */
export function createGuardState() {
  return {
    plans: new Map<string, Plan>(),
    sizes: new Map<string, { rows: number; at: number }>(),
    usage: new Map<string, Usage>(),
    warnings: new Map<string, Warning>(),
    seen: new Set<string>(),
    settings: undefined as Settings | undefined,
    settingsAt: 0,
    tableNames: undefined as string[] | undefined,
    pendingStatements: 0,
    flushedAt: Date.now(),
    flushing: undefined as Promise<void> | undefined,
  };
}

export function guard(inner: Client, options: GuardOptions): GuardedClient {
  const state = options.state ?? createGuardState();
  const { plans, sizes, usage, warnings, seen } = state;
  let openTransactions = 0;
  let lastCharge = 0;

  async function loadSettings(via: Executor): Promise<Settings> {
    if (state.settings && Date.now() - state.settingsAt < SETTINGS_TTL_MS) return state.settings;
    let rows: ResultSet["rows"];
    try {
      rows = (await via.execute("SELECT key, value FROM gtm_settings")).rows;
    } catch (error) {
      if (!/no such table/i.test(String(error))) throw error;
      // A workspace that has not migrated yet; the statements are idempotent. A read-only connection keeps defaults.
      for (const statement of guardSchemaSql.split(";").filter((s) => s.trim())) await via.execute(statement).catch(() => undefined);
      rows = [];
    }
    const settings: Settings = { ...settingDefaults };
    for (const row of rows)
      if (Object.hasOwn(settingDefaults, String(row.key))) settings[String(row.key) as SettingKey] = String(row.value);
    state.settings = settings;
    state.settingsAt = Date.now();
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
    const cap = usage.get(scope)?.cap ?? (key ? Number(s[key]) : Infinity);
    // The ceiling holds whatever was saved: a run's own cap, or a rows_per_run written above it.
    return scope.startsWith("run:") ? Math.min(cap, Number(s.rows_per_run_ceiling)) : cap;
  };

  async function planOf(via: Executor, sql: string, args: InArgs | undefined): Promise<Plan> {
    const shape = shapeOf(sql);
    const known = plans.get(shape);
    if (known) return known;
    const target = planTarget(sql, args);
    const details = target.scanAll ? [`SCAN ${target.scanAll}`] : [];
    for (const t of target.targets)
      details.push(...(await (options.planner ?? via).execute({ sql: `EXPLAIN QUERY PLAN ${t.sql}`, args: t.args ?? [] })).rows.map((r) => String(r.detail)));
    const plan = readPlan(details, sql);
    plans.set(shape, plan);
    return plan;
  }

  /** The plan prints an alias when the query has one; map it back to the table to size it and name it. */
  async function tablesOf(via: Executor, sql: string, names: string[]) {
    const listTables = async () => (await via.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => String(r.name));
    const resolve = (known: string[]) => {
      const real = new Set(known);
      const aliases = new Map<string, string>();
      for (const m of bare(sql.replace(/"/g, "")).matchAll(/\b(?:FROM|JOIN|UPDATE|INTO)\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?|,\s*(\w+)\s+(?:AS\s+)?(\w+)/gi)) {
        const [table, alias] = m[1] ? [m[1], m[2]] : [m[3], m[4]];
        if (real.has(table)) aliases.set(alias ?? table, table).set(table, table);
      }
      return names.map((name) => ({ name, table: aliases.get(name) ?? (real.has(name) ? name : null) }));
    };
    let resolved = resolve((state.tableNames ??= await listTables()));
    // A table created since the list was read: read the list once more before calling a name unknown.
    if (resolved.some((r) => !r.table)) resolved = resolve((state.tableNames = await listTables()));
    return resolved;
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

  /**
   * What a spent budget stops. The costly things: an agent question, a scan by someone browsing, and further reads
   * of a run over its own budget. Never writes, never indexed reads by the runtime itself, and never a run already
   * in flight when the workspace's day is spent (new runs are stopped where they start, in lib/spend.ts). So a
   * spent budget cannot lock the owner out of the settings that raise it.
   */
  function stoppedBy(exhausted: string, context: GuardContext, scanning: boolean, write: boolean) {
    if (context.scope.startsWith("agent")) return true;
    if (context.scope.startsWith("browse:")) return scanning;
    if (context.scope.startsWith("run:")) return exhausted === context.scope && !write;
    return false;
  }

  /** Everything that can refuse a statement. Returns the violations instead of throwing, so the caller decides. */
  async function assess(via: Executor, sql: string, args: InArgs | undefined) {
    const s = await loadSettings(via);
    const context: GuardContext = { mode: options.mode, scope: options.scope, ...(await options.resolve?.()) };
    const day = `day:${today()}`;
    const violations: { kind: string; shape: string; tables: string; charge: number; error: Error; once?: boolean }[] = [];
    const plan = await planOf(via, sql, args);
    let scanned = 0;
    let tables = "";
    if (plan.scans.length) {
      const resolved = await tablesOf(via, sql, plan.scans);
      tables = [...new Set(resolved.map((r) => r.table ?? r.name))].join(",");
      for (const r of resolved) scanned += (await sizeOf(via, r.table)) * (plan.json ? JSON_FACTOR : 1);
      if (context.mode === "strict") {
        const named = resolved.map((r) => (r.table && r.table !== r.name ? `${r.table} (as ${r.name})` : (r.table ?? r.name))).join(", ");
        violations.push({ kind: "scan", shape: shapeOf(sql), tables, charge: scanned + 1, error: new ScanRefusedError(`Query scans ${named}. In a workflow or runtime code every query must be an index search, because Turso bills every row scanned. Use nextBatch, companiesOf or progressCounts from lib/profiles/population.ts, filter through profile_memberships or person_companies, or add an index in a migration. See references/cost.md. SQL: ${shapeOf(sql).slice(0, 300)}`) });
      } else if (scanned > Number(s.rows_per_statement))
        violations.push({ kind: "statement", shape: shapeOf(sql), tables, charge: scanned, error: new BudgetExceededError(`This statement would scan about ${scanned} rows of ${tables}, above rows_per_statement (${s.rows_per_statement}). Filter through an indexed column, profile_memberships or person_companies, or ask the workspace owner to raise rows_per_statement in gtm_settings. See references/cost.md.`) });
    }
    if (plan.offset && context.mode === "strict")
      violations.push({ kind: "offset", shape: shapeOf(sql), tables, charge: 0, error: new ScanRefusedError(`OFFSET paging re-reads every skipped row on each page (LIMIT offset, count is the same). Page by key instead (WHERE key > ? ORDER BY key LIMIT ?), or use nextBatch from lib/profiles/population.ts. SQL: ${shapeOf(sql).slice(0, 300)}`) });
    await loadUsage(via, [context.scope, day]);
    const write = isWrite(sql);
    for (const scope of [context.scope, day]) {
      const u = usage.get(scope)!;
      const cap = capOf(scope, s);
      if (u.used + u.pending < cap || !stoppedBy(scope, context, plan.scans.length > 0, write)) continue;
      const setting = scope === context.scope && u.cap != null ? "maxRowsRead" : capSetting(scope);
      violations.push({ kind: "budget", shape: `over ${cap}`, tables: "", charge: u.used + u.pending, once: true, error: new BudgetExceededError(`Row-read budget spent for ${scope}: ${u.used + u.pending} of ${cap} estimated rows. The workspace owner can raise "${setting}" in gtm_settings (PUT /api/settings), and a run can pass maxRowsRead up to rows_per_run_ceiling. See references/cost.md.`) });
    }
    return { context, enforce: s.guard_mode !== "warn", violations, scanned, scopes: [context.scope, day] };
  }

  /**
   * An error inside the guard itself (the planner, a settings read, a mis-rewritten write) never breaks the
   * statement, in warn or enforce mode: it is recorded as `internal` in guard_log and the statement runs unchecked.
   * The build's query check is the enforcing gate; the guard must not become an outage of its own.
   */
  async function check(via: Executor, sql: string, args: InArgs | undefined) {
    if (SKIP.test(sql)) return undefined;
    let assessed: Awaited<ReturnType<typeof assess>>;
    try {
      assessed = await assess(via, sql, args);
    } catch (error) {
      warn("internal", options.scope, `${error instanceof Error ? error.message : String(error)} :: ${shapeOf(sql)}`.slice(0, 500), "", 0);
      state.pendingStatements++;
      return undefined;
    }
    for (const v of assessed.violations) {
      if (assessed.enforce) throw v.error;
      warn(v.kind, assessed.context.scope, v.shape, v.tables, v.charge, v.once);
    }
    return { scanned: assessed.scanned, scopes: assessed.scopes };
  }

  function charge(checked: Awaited<ReturnType<typeof check>>, result: ResultSet) {
    if (!checked) return;
    // Never zero: an empty lookup still costs a round trip, and a loop of them must still run into its budget.
    lastCharge = Math.max(1, checked.scanned + result.rows.length);
    for (const scope of checked.scopes) {
      // Another client's flush may have pruned the scope while this statement ran.
      const u = usage.get(scope) ?? { used: 0, pending: 0, cap: null };
      u.pending += lastCharge;
      usage.set(scope, u);
    }
    state.pendingStatements++;
  }

  /** One flush at a time per database: two connections writing at once collide on a local file. */
  function flush(): Promise<void> {
    const run = (state.flushing ?? Promise.resolve()).catch(() => undefined).then(writePending);
    state.flushing = run;
    return run;
  }
  async function writePending() {
    if (openTransactions) return;
    const now = new Date().toISOString();
    for (const [scope, u] of usage) {
      if (!u.pending) continue;
      const pending = u.pending;
      u.pending = 0;
      const saved = await inner
        .execute({
          sql: "INSERT INTO usage_budget (scope, used, cap, updated_at) VALUES (?,?,NULL,?) ON CONFLICT(scope) DO UPDATE SET used = used + excluded.used, updated_at = excluded.updated_at RETURNING used, cap",
          args: [scope, pending, now],
        })
        .catch((error) => {
          u.pending += pending;
          throw error;
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
    // Finished runs and past days: nothing pending, so they can be read again if they return.
    if (usage.size > 500) for (const [scope, u] of usage) if (!u.pending) usage.delete(scope);
    state.pendingStatements = 0;
    state.flushedAt = Date.now();
  }
  async function maybeFlush() {
    const rows = [...usage.values()].reduce((n, u) => Math.max(n, u.pending), 0);
    if (rows >= FLUSH_ROWS || state.pendingStatements >= FLUSH_STATEMENTS || (state.pendingStatements && Date.now() - state.flushedAt > FLUSH_MS))
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
      void maybeFlush().finally(() => inner.close());
    },
    flush,
    settle: maybeFlush,
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
