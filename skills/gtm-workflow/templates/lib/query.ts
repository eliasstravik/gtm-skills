import type { InValue } from "@libsql/client";
import { rawClient } from "./db";

/**
 * The only way a workflow file writes its own SQL. Turso bills every row a query scans, so every workflow query is
 * registered here by name with example arguments; `npm run build` (scripts/check-queries.mjs) runs each one against
 * a seeded database and fails the deploy if it scans a table, pages by OFFSET, or returns a heavy JSON column. At
 * run time the same guard applies. Prefer the helpers in lib/profiles/population.ts; write a query only when none
 * fits. `??` stands for a list: `WHERE key IN (??)` takes an array argument of any length.
 *
 *   const scored = defineQuery({ name: "score/above", sql: "SELECT key, score FROM scores WHERE score >= ? ORDER BY score LIMIT 50", example: [70] });
 *   const rows = await scored([80]); // inside a "use step" function
 *
 * A Drizzle query registers the same way with `build` in place of `sql`:
 *   defineQuery({ name: "score/one", build: (key: string) => db().select().from(scores).where(eq(scores.key, key)), example: ["a"] });
 */
export type QueryArg = InValue | InValue[];
type Built = PromiseLike<unknown> & { toSQL(): { sql: string; params: unknown[] } };
type SqlDefinition = { name: string; sql: string; example: QueryArg[] };
type BuiltDefinition<A extends unknown[]> = { name: string; build: (...args: A) => Built; example: A };
type Registered = { name: string; run: () => Promise<{ columns: string[]; rows: number }> };

const registry = new Map<string, Registered>();
/** Every query defined by the modules loaded so far; the build check imports the workflows and runs these. */
export const definedQueries = () => [...registry.values()];

/** `??` becomes one placeholder per item of its array argument; quoted text is left alone. */
export function expand(sql: string, args: QueryArg[]) {
  const flat: InValue[] = [];
  let next = 0;
  const text = sql.replace(/'(?:[^']|'')*'|\?\?|\?/g, (token) => {
    if (token[0] === "'") return token;
    const arg = args[next++];
    if (token === "??") {
      if (!Array.isArray(arg)) throw new Error("A ?? placeholder takes an array argument");
      flat.push(...arg);
      return arg.map(() => "?").join(",");
    }
    if (Array.isArray(arg) || arg === undefined) throw new Error("A ? placeholder takes one value; use ?? for a list");
    flat.push(arg);
    return "?";
  });
  if (next !== args.length) throw new Error(`Expected ${next} arguments, got ${args.length}`);
  return { sql: text, args: flat };
}

async function execute(sql: string, args: QueryArg[]) {
  const client = rawClient();
  try {
    return await client.execute(expand(sql, args));
  } finally {
    client.close();
  }
}

export function defineQuery<R = Record<string, unknown>>(definition: SqlDefinition): (args?: QueryArg[]) => Promise<R[]>;
export function defineQuery<A extends unknown[], B extends Built>(definition: BuiltDefinition<A>): (...args: A) => B;
export function defineQuery(definition: SqlDefinition | BuiltDefinition<unknown[]>) {
  if (registry.has(definition.name)) throw new Error(`Query ${definition.name} is defined twice`);
  if ("build" in definition) {
    registry.set(definition.name, {
      name: definition.name,
      run: async () => {
        const rows = (await definition.build(...definition.example)) as unknown;
        const first = Array.isArray(rows) ? rows[0] : undefined;
        return { columns: first && typeof first === "object" ? Object.keys(first) : [], rows: Array.isArray(rows) ? rows.length : 0 };
      },
    });
    return definition.build;
  }
  registry.set(definition.name, {
    name: definition.name,
    run: async () => {
      const result = await execute(definition.sql, definition.example);
      return { columns: result.columns, rows: result.rows.length };
    },
  });
  return async (args: QueryArg[] = []) => (await execute(definition.sql, args)).rows.map((row) => ({ ...row }));
}
