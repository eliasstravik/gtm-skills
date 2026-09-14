import { and, eq } from "drizzle-orm";
import { cache } from "../db/tables/cache";
import { db } from "./db";

/** Route-side reads about runs. Never import from a workflow: it reaches the database directly. */

/** Child run ids a fanned-out parent started, recorded by lib/rows.ts; empty for a run without children. */
export async function listChildren(parentRunId: string): Promise<string[]> {
  const [row] = await db().select().from(cache).where(and(eq(cache.name, "children"), eq(cache.hash, parentRunId)));
  return row ? (JSON.parse(row.value) as string[]) : [];
}
