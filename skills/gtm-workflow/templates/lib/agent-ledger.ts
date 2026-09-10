// gtm-lib v22
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { redact } from "./redact";
import { getDb } from "./db";
import { enrichmentRuns } from "./schema";
import type { PaidCallMeta } from "./provider";

export type AgentCall = {
  meta: PaidCallMeta;
  operation: string;
  provider: string;
  endpoint: string;
  costUsd: number;
  costKind: "upper-bound" | "estimate";
  maxSpendUsd: number;
  maxCalls: number;
  maxToolCalls?: number;
};

/** Atomic admission accounts for concurrent calls and leaves ambiguous attempts reserved. */
export async function reserveAgentCall(call: AgentCall): Promise<string> {
  "use step";
  if (process.env.GTM_SANDBOX === "1") throw new Error("The authoring sandbox cannot execute agents");
  for (const amount of [call.costUsd, call.maxSpendUsd]) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid agent spending limit");
  }
  if (!Number.isSafeInteger(call.maxCalls) || call.maxCalls < 1) throw new Error("Invalid call limit");
  const db = await getDb();
  const id = createHash("sha256").update(JSON.stringify([
    call.meta.runKey, call.meta.rowKey ?? null, call.meta.step, call.operation,
  ])).digest("hex");
  // A single INSERT ... SELECT is the lock. A read followed by an insert races.
  const rows = await db.all(sql`
    INSERT INTO enrichment_runs (id, run_key, workflow, row_key, step, provider, endpoint,
      inputs_hash, status, cost_usd, cost_source, created_at)
    SELECT ${id}, ${call.meta.runKey}, ${call.meta.slug}, ${call.meta.rowKey ?? null},
      ${call.meta.step ?? null}, ${call.provider}, ${call.endpoint}, ${id}, 'pending',
      ${call.costUsd}, ${call.costKind === "estimate" ? "projected" : "fixed"}, ${Date.now()}
    WHERE NOT EXISTS (SELECT 1 FROM workflow_runs WHERE run_key = ${call.meta.runKey}
      AND (cancel_requested_at IS NOT NULL OR finished_at IS NOT NULL))
    AND (SELECT coalesce(sum(cost_usd), 0) FROM enrichment_runs
      WHERE run_key = ${call.meta.runKey}) + ${call.costUsd} <= ${call.maxSpendUsd}
    AND (SELECT count(*) FROM enrichment_runs WHERE run_key = ${call.meta.runKey}
      AND row_key IS ${call.meta.rowKey ?? null} AND step IS ${call.meta.step ?? null}
      AND endpoint = ${call.endpoint}) < ${call.maxCalls}
    AND (${call.maxToolCalls ?? null} IS NULL OR
      (SELECT count(*) FROM enrichment_runs WHERE run_key = ${call.meta.runKey}
       AND row_key IS ${call.meta.rowKey ?? null} AND step IS ${call.meta.step ?? null}
       AND provider = 'agent-tool') < ${call.maxToolCalls ?? null})
    ON CONFLICT(id) DO NOTHING RETURNING id
  `);
  if (rows.length !== 1) {
    const spent = await db.all<{ cost: number }>(sql`SELECT coalesce(sum(cost_usd), 0) AS cost FROM enrichment_runs WHERE run_key = ${call.meta.runKey}`);
    if (Number(spent[0]?.cost ?? 0) + call.costUsd > call.maxSpendUsd) throw new Error("[spend_cap] Call exceeds the remaining accepted budget");
    throw new Error("Agent call refused: limit, cancellation, or an already admitted operation; inspect the ledger before retrying");
  }
  return id;
}

export async function settleAgentCall(id: string, costUsd?: number, failed = false, error?: string): Promise<void> {
  "use step";
  if (costUsd !== undefined && (!Number.isFinite(costUsd) || costUsd < 0)) {
    throw new Error("Invalid reported cost; reservation retained");
  }
  const db = await getDb();
  await db.update(enrichmentRuns).set({
    status: failed ? "error" : "success",
    ...(costUsd === undefined ? {} : { costUsd, costSource: "reported" as const }),
    ...(failed ? { errorKind: "call" as const, error: error ? redact(error) : "Agent operation failed; inspect runtime trace" } : {}),
  }).where(eq(enrichmentRuns.id, id));
}

reserveAgentCall.maxRetries = 0;
