// gtm-lib v19
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { start } from "workflow/api";
import { getDb, updateRunPlain } from "./db";

export type EventDefinition = {
  enabled: boolean;
  workflowPath: string;
  secretEnv: string;
  signatureHeader: string;
  /** HMAC-SHA256 of the exact request bytes, hex encoded. */
  signaturePrefix?: string;
  maxBodyBytes: number;
  maxEventsPerDay: number;
  /** Accepted per-run spend, used to disclose the daily maximum when enabling. */
  maxSpendUsd: number;
  /** Reject stale events and validate the business schema here. Return null for ignored event types. */
  parse: (body: unknown) => { id: string; input: unknown } | null;
};

export function verifyEventSignature(body: Uint8Array, signature: string | null, secret: string, prefix = "") {
  if (!signature?.startsWith(prefix)) return false;
  const hex = signature.slice(prefix.length);
  if (!/^[a-f0-9]{64}$/i.test(hex)) return false;
  return timingSafeEqual(createHmac("sha256", secret).update(body).digest(), Buffer.from(hex, "hex"));
}

/** Permanent intake starts runs; it is separate from per-run callback hooks. */
export async function receiveEvent(request: Request, source: string, definition: EventDefinition) {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!definition.enabled) return new Response("event source disabled", { status: 404 });
  if (process.env.GTM_SANDBOX === "1") return new Response("execution unavailable", { status: 403 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source) ||
      !/^(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.workflowPath) ||
      !Number.isSafeInteger(definition.maxEventsPerDay) || definition.maxEventsPerDay < 1 ||
      !Number.isSafeInteger(definition.maxBodyBytes) || definition.maxBodyBytes < 1 || definition.maxBodyBytes > 1000000 ||
      !Number.isFinite(definition.maxSpendUsd) || definition.maxSpendUsd < 0) {
    throw new Error("Invalid committed event definition");
  }
  const secret = process.env[definition.secretEnv];
  if (!secret) return new Response("event source not configured", { status: 503 });
  const reader = request.body?.getReader();
  if (!reader) return new Response("body required", { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > definition.maxBodyBytes) return new Response("body too large", { status: 413 });
      chunks.push(chunk.value);
    }
  } finally { await reader.cancel(); }
  const raw = Buffer.concat(chunks);
  if (!verifyEventSignature(raw, request.headers.get(definition.signatureHeader), secret, definition.signaturePrefix)) {
    return new Response("invalid signature", { status: 401 });
  }
  let event: ReturnType<EventDefinition["parse"]>;
  try { event = definition.parse(JSON.parse(raw.toString("utf8"))); }
  catch { return new Response("invalid event", { status: 400 }); }
  if (event === null) return new Response(null, { status: 204 });
  if (typeof event.id !== "string" || !event.id || event.id.length > 500) return new Response("invalid event id", { status: 400 });
  const runKey = createHash("sha256").update(JSON.stringify([source, event.id])).digest("hex").slice(0, 32);
  const scheduledFor = `event:${source}:${runKey}`;
  const now = Date.now();
  const dayStart = Math.floor(now / 86400000) * 86400000;
  const db = await getDb();
  const existing = await db.all(sql`SELECT run_id FROM workflow_runs WHERE run_key = ${runKey}`);
  if (existing.length) return Response.json({ accepted: true, duplicate: true, runKey }, { status: 202 });
  const input = JSON.stringify(event.input);
  const inputHash = createHash("sha256").update(JSON.stringify([source, event.id, event.input])).digest("hex");
  const slug = definition.workflowPath.split("/").at(-1)!;
  const rows = await db.all(sql`
    INSERT INTO workflow_runs (run_key, workflow, path, method, input, input_hash, status, scheduled_for, started_at)
    SELECT ${runKey}, ${slug}, ${definition.workflowPath}, 'POST', ${input}, ${inputHash}, 'running', ${scheduledFor}, ${now}
    WHERE (SELECT count(*) FROM workflow_runs WHERE scheduled_for LIKE ${`event:${source}:%`}
      AND started_at >= ${dayStart}) < ${definition.maxEventsPerDay}
    ON CONFLICT DO NOTHING RETURNING run_key
  `);
  if (!rows.length) {
    const duplicate = await db.all(sql`SELECT run_key FROM workflow_runs WHERE run_key = ${runKey}`);
    return duplicate.length
      ? Response.json({ accepted: true, duplicate: true, runKey }, { status: 202 })
      : new Response("accepted daily event limit reached", { status: 429 });
  }
  const functionName = slug.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
  try {
    const run = await start({ workflowId: `workflow//./workflows/${definition.workflowPath}//${functionName}` },
      [event.input, { runKey, slug, checkpoint: null, scheduledFor, maxSpendUsd: definition.maxSpendUsd }],
      { attributes: { gtmRunKey: runKey, eventSource: source, workspaceHead: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" } });
    await updateRunPlain(runKey, { runId: run.runId }).catch(() => undefined);
    return Response.json({ accepted: true, runKey }, { status: 202 });
  } catch {
    // start() may have succeeded remotely. Retain the claim forever rather than duplicate effects.
    await updateRunPlain(runKey, { error: "Event accepted; workflow start outcome unknown. Reconcile by gtmRunKey before recovery." }).catch(() => undefined);
    return Response.json({ accepted: true, runKey, recoveryRequired: true }, { status: 202 });
  }
}
