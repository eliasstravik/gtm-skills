import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { cache } from "./schema/cache";
import { db } from "./db";
import type { Intake } from "./intake";
import type { Row } from "./rows";

/** Route-side: verify the signature, dedupe by event id, map to a row. Never import from a workflow. */

const DEDUPE_MS = 30 * 24 * 60 * 60 * 1000;
/** A claim with no run after this long was a start that died; a redelivery takes it over. */
const UNSTARTED_S = 120;

export type IntakeOutcome = { status: number; body: Record<string, unknown> };

/** Verify, dedupe, and map; the route starts the run when a row comes back. */
export async function admit<E>(slug: string, intake: Intake<E>, rawBody: string, headers: Headers): Promise<{ row: Row | null; eventId?: string; reply: IntakeOutcome }> {
  const secret = process.env[intake.secretEnv];
  if (!secret) return { row: null, reply: { status: 503, body: { error: `Set ${intake.secretEnv} on the workflow project` } } };
  const given = headers.get(intake.signature.header) ?? "";
  const expected = `${intake.signature.prefix ?? ""}${createHmac(intake.signature.algorithm ?? "sha256", secret).update(rawBody).digest(intake.signature.encoding ?? "hex")}`;
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return { row: null, reply: { status: 401, body: { error: "Bad signature" } } };
  let event: E;
  try {
    event = JSON.parse(rawBody) as E;
  } catch {
    return { row: null, reply: { status: 400, body: { error: "Body is not JSON" } } };
  }
  const id = `${slug}:${intake.eventId(event)}`;
  const row = intake.toRow(event);
  if (!row) return { row: null, reply: { status: 200, body: { ignored: true } } };
  // The dedupe gate is one statement, so two deliveries of one event at once start one run. A claim is taken over when
  // it expired, or when it never got a run (the start failed and was not released, say the function died mid-way).
  const now = new Date();
  const [claimed] = await db().insert(cache)
    .values({ name: "intake", hash: id, value: { slug, key: row.key }, created_at: now, expires_at: new Date(now.getTime() + DEDUPE_MS) })
    .onConflictDoUpdate({
      target: [cache.name, cache.hash],
      set: { value: sql`excluded.value`, created_at: sql`excluded.created_at`, expires_at: sql`excluded.expires_at` },
      setWhere: sql`${cache.expires_at} <= now() OR (${cache.value}->>'runId' IS NULL AND ${cache.created_at} < now() - make_interval(secs => ${UNSTARTED_S}))`,
    })
    .returning({ hash: cache.hash });
  if (!claimed) return { row: null, reply: { status: 200, body: { duplicate: true } } };
  return { row, eventId: id, reply: { status: 202, body: {} } };
}

/** After the start: the event is seen for good, with its run. */
export async function markStarted(eventId: string, runId: string) {
  await db().update(cache).set({ value: sql`${cache.value} || ${JSON.stringify({ runId })}::jsonb` }).where(and(eq(cache.name, "intake"), eq(cache.hash, eventId)));
}
/** The start failed: forget the event, so the sender's retry starts it. */
export async function releaseEvent(eventId: string) {
  await db().delete(cache).where(and(eq(cache.name, "intake"), eq(cache.hash, eventId), sql`${cache.value}->>'runId' IS NULL`));
}
