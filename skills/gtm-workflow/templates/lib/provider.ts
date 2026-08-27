// gtm-lib v9
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { enrichmentCache, enrichmentRuns } from "./schema";

export type PaidCallMeta = { runKey: string; slug: string };

export type ProviderInput<T extends z.ZodTypeAny> = {
  name: string;
  endpoint: string;
  input: unknown;
  schema: T;
  ttlMs: number;
  costUsd?: number;
  call: () => Promise<
    | z.input<T>
    | { value: z.input<T>; raw?: unknown; costUsd?: number }
  >;
  /** Rebuild the adapter value from a preserved vendor response on cache hits. */
  parseRaw?: (raw: unknown) => z.input<T>;
  meta: PaidCallMeta;
  isEmpty?: (value: z.infer<T>) => boolean;
};

export type PaidCallResult<T> = {
  value: T;
  costUsd: number;
  status: "cache_hit" | "success" | "empty";
};

export async function provider<T extends z.ZodTypeAny>(
  input: ProviderInput<T>,
): Promise<PaidCallResult<z.infer<T>>> {
  const db = await getDb();
  const canonical = stableJson(input.input);
  const inputsHash = createHash("sha256").update(canonical).digest("hex");
  const now = Date.now();
  const cache = (
    await db
      .select()
      .from(enrichmentCache)
      .where(
        and(
          eq(enrichmentCache.provider, input.name),
          eq(enrichmentCache.endpoint, input.endpoint),
          eq(enrichmentCache.inputsHash, inputsHash),
        ),
      )
      .limit(1)
  )[0];

  if (cache && cache.expiresAt > now) {
    const raw = JSON.parse(cache.raw ?? cache.value);
    const value = input.schema.parse(input.parseRaw ? input.parseRaw(raw) : raw);
    await writeLedger(input, inputsHash, "cache_hit", 0, null);
    return { value, costUsd: 0, status: "cache_hit" };
  }

  try {
    const called = await input.call();
    const reported = unwrapCallResult(called);
    const value = input.schema.parse(reported.value);
    const empty = input.isEmpty?.(value) ?? isEmpty(value);
    const costUsd = reported.costUsd ?? input.costUsd ?? 0;
    await db
      .insert(enrichmentCache)
      .values({
        provider: input.name,
        endpoint: input.endpoint,
        inputsHash,
        inputs: canonical,
        raw: JSON.stringify(reported.raw),
        value: JSON.stringify(value),
        expiresAt: now + input.ttlMs,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [
          enrichmentCache.provider,
          enrichmentCache.endpoint,
          enrichmentCache.inputsHash,
        ],
        set: {
          inputs: canonical,
          raw: JSON.stringify(reported.raw),
          value: JSON.stringify(value),
          expiresAt: now + input.ttlMs,
          createdAt: now,
        },
      });
    const status = empty ? "empty" : "success";
    await writeLedger(input, inputsHash, status, costUsd, null);
    return { value, costUsd, status };
  } catch (error) {
    await writeLedger(input, inputsHash, "error", input.costUsd ?? null, message(error));
    throw error;
  }
}

async function writeLedger(
  input: Pick<ProviderInput<any>, "meta" | "name" | "endpoint">,
  inputsHash: string,
  status: "cache_hit" | "success" | "empty" | "error",
  costUsd: number | null,
  error: string | null,
) {
  const db = await getDb();
  await db.insert(enrichmentRuns).values({
    id: randomUUID(),
    runKey: input.meta.runKey,
    workflow: input.meta.slug,
    provider: input.name,
    endpoint: input.endpoint,
    inputsHash,
    status,
    costUsd,
    error,
    createdAt: Date.now(),
  });
}

function unwrapCallResult<T>(
  value: T | { value: T; raw?: unknown; costUsd?: number },
) {
  if (
    value &&
    typeof value === "object" &&
    "value" in value &&
    ("costUsd" in value || Object.keys(value).length <= 2)
  ) {
    const reported = value as { value: T; raw?: unknown; costUsd?: number };
    return {
      value: reported.value,
      raw: reported.raw ?? reported.value,
      costUsd: reported.costUsd,
    };
  }
  return { value: value as T, raw: value, costUsd: undefined };
}

function isEmpty(value: unknown): boolean {
  if (value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && Object.keys(value as object).length === 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
