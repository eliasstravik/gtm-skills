import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cache } from "../db/tables/cache";
import { db, upsert } from "./db";
import type { Intake } from "./intake";
import type { Row } from "./rows";

/** Route-side: verify the signature, dedupe by event id, map to a row. Never import from a workflow. */

const DEDUPE_MS = 30 * 24 * 60 * 60 * 1000;

export type IntakeOutcome = { status: number; body: Record<string, unknown> };

/** Verify, dedupe, and map; the route starts the run when a row comes back. */
export async function admit<E>(slug: string, intake: Intake<E>, rawBody: string, headers: Headers): Promise<{ row: Row | null; reply: IntakeOutcome }> {
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
  const [seen] = await db().select().from(cache).where(eq(cache.hash, id));
  if (seen && seen.expires_at > new Date().toISOString()) return { row: null, reply: { status: 200, body: { duplicate: true } } };
  const row = intake.toRow(event);
  if (!row) return { row: null, reply: { status: 200, body: { ignored: true } } };
  const now = new Date();
  await upsert("cache", [{ name: "intake", hash: id, value: JSON.stringify({ slug, key: row.key }), created_at: now.toISOString(), expires_at: new Date(now.getTime() + DEDUPE_MS).toISOString() }], ["name", "hash"]);
  return { row, reply: { status: 202, body: {} } };
}
