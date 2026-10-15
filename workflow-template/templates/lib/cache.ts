import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, upsert } from "./db";
import { cache } from "./schema/cache";

export type Priced<T> = { value: T; costUsd: number };

/**
 * Call only inside a "use step" function. Keyed on provider + question (name + hash of input), never on workflow.
 * fn returns the raw response (text or JSON) with its cost; a hit returns the stored value with costUsd 0. The caller parses.
 */
export async function cached<T>(name: string, input: unknown, ttlMs: number, fn: () => Promise<Priced<T>>): Promise<Priced<T>> {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  // Expiry is judged by the database's clock, the one clock every process shares.
  const [hit] = await db().select({ value: cache.value }).from(cache).where(and(eq(cache.name, name), eq(cache.hash, hash), gt(cache.expires_at, sql`now()`)));
  if (hit) return { value: hit.value as T, costUsd: 0 };
  const fresh = await fn();
  const now = new Date();
  await upsert("cache", [{ name, hash, value: fresh.value, created_at: now, expires_at: new Date(now.getTime() + ttlMs) }], ["name", "hash"]);
  return fresh;
}
