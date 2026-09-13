import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cache } from "../db/tables/cache";
import { db, upsert } from "./db";

export type Priced<T> = { value: T; costUsd: number };

/**
 * Call only inside a "use step" function. Keyed on provider + question (name + hash of input), never on workflow.
 * fn returns the raw response (text or JSON) with its cost; a hit returns the stored value with costUsd 0. The caller parses.
 */
export async function cached<T>(name: string, input: unknown, ttlMs: number, fn: () => Promise<Priced<T>>): Promise<Priced<T>> {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const now = new Date();
  const [hit] = await db().select().from(cache).where(and(eq(cache.name, name), eq(cache.hash, hash)));
  if (hit && hit.expires_at > now.toISOString()) return { value: JSON.parse(hit.value) as T, costUsd: 0 };
  const fresh = await fn();
  await upsert(
    "cache",
    [{ name, hash, value: JSON.stringify(fresh.value), created_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlMs).toISOString() }],
    ["name", "hash"],
  );
  return fresh;
}
