import { randomUUID } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";
import { transaction, sanitize } from "./store";
import { guardSchemaSql } from "../db-guard";
import { assertRunMayStart, chargeSpendMicro, spendFits } from "../spend";

/** Includes the guard's tables: the day's paid-call cap is read from gtm_settings and kept in usage_budget. */
export const ledgerSchemaSql = `${guardSchemaSql}
CREATE TABLE IF NOT EXISTS profile_runs (
 id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL, owner TEXT NOT NULL, lease_until INTEGER NOT NULL,
 state TEXT NOT NULL, budget_micro INTEGER NOT NULL, spent_micro INTEGER NOT NULL DEFAULT 0,
 reserved_micro INTEGER NOT NULL DEFAULT 0, input_json TEXT NOT NULL, companies_json TEXT,
 omitted INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_single_flight ON profile_runs ((1)) WHERE state = 'running';
CREATE INDEX IF NOT EXISTS profile_runs_state ON profile_runs (state);
CREATE TABLE IF NOT EXISTS profile_work (
 run_id TEXT NOT NULL, phase TEXT NOT NULL, entity_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 PRIMARY KEY (run_id, phase, entity_key)
);
CREATE TABLE IF NOT EXISTS profile_attempts (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL, entity_key TEXT NOT NULL, operation TEXT NOT NULL,
 state TEXT NOT NULL, reserved_micro INTEGER NOT NULL, cost_micro INTEGER, job_id TEXT, response_json TEXT,
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_unsettled ON profile_attempts (entity_key, operation) WHERE state IN ('reserved','dispatched','uncertain');
CREATE INDEX IF NOT EXISTS profile_attempts_lookup ON profile_attempts (entity_key, operation, created_at);
CREATE TABLE IF NOT EXISTS profile_inputs (
 workflow_id TEXT NOT NULL, source_id TEXT NOT NULL, row_id TEXT NOT NULL, input_json TEXT NOT NULL,
 person_key TEXT, first_observed_at TEXT NOT NULL, last_observed_at TEXT NOT NULL,
 PRIMARY KEY (workflow_id, source_id, row_id)
);`;
const micros = (usd: number) => {
  if (!Number.isFinite(usd) || usd < 0 || usd > 100000)
    throw new Error("Invalid spending limit");
  return Math.ceil(usd * 1e6);
};
const LEASE_MS = 15 * 60 * 1000;
export type RunLease = { id: string; owner: string };
export type WorkState =
  | "pending"
  | "done"
  | "reused"
  | "no_match"
  | "failed"
  | "unresolved"
  | "ambiguous"
  | "budget_deferred"
  | "uncertain";
async function assertLease(tx: Transaction, lease: RunLease) {
  const row = (
    await tx.execute({
      sql: "SELECT * FROM profile_runs WHERE id = ?",
      args: [lease.id],
    })
  ).rows[0];
  if (
    !row ||
    row.owner !== lease.owner ||
    row.state !== "running" ||
    Number(row.lease_until) < Date.now()
  )
    throw new Error("Run is cancelled or another worker owns it");
  await tx.execute({
    sql: "UPDATE profile_runs SET lease_until = ? WHERE id = ?",
    args: [Date.now() + LEASE_MS, lease.id],
  });
  return row;
}
/** A stale run must be explicitly resumed; a fresh run never steals its lock. */
export async function beginRun(
  client: Client,
  options: {
    id: string;
    owner: string;
    workflowId: string;
    budgetUsd: number;
    input: unknown[];
    omitted: number;
    resume?: boolean;
  },
) {
  return transaction(client, async (tx) => {
    const active = (
      await tx.execute("SELECT * FROM profile_runs WHERE state = 'running'")
    ).rows[0];
    if (
      active &&
      (active.id !== options.id ||
        (active.owner !== options.owner &&
          Number(active.lease_until) >= Date.now()))
    )
      return { status: "already_running" as const, runId: String(active.id) };
    const existing = (
      await tx.execute({
        sql: "SELECT * FROM profile_runs WHERE id = ?",
        args: [options.id],
      })
    ).rows[0];
    if (existing) {
      if (existing.workflow_id !== options.workflowId)
        throw new Error("Run belongs to another workflow");
      if (existing.owner !== options.owner && !options.resume)
        throw new Error("Explicit resume required");
      if (existing.state === "complete")
        return { status: "complete" as const, runId: options.id };
      await tx.execute({
        sql: "UPDATE profile_runs SET owner = ?, state = 'running', lease_until = ? WHERE id = ?",
        args: [options.owner, Date.now() + LEASE_MS, options.id],
      });
    } else {
      if (options.resume) throw new Error("Unknown saved run");
      // A new run does not start once the day's paid-call cap or row-read budget is used up; a resume may finish.
      await assertRunMayStart(tx);
      await tx.execute({
        sql: "INSERT INTO profile_runs (id,workflow_id,owner,lease_until,state,budget_micro,input_json,omitted,created_at) VALUES (?,?,?,?,'running',?,?,?,?)",
        args: [
          options.id,
          options.workflowId,
          options.owner,
          Date.now() + LEASE_MS,
          micros(options.budgetUsd),
          JSON.stringify(options.input),
          options.omitted,
          new Date().toISOString(),
        ],
      });
    }
    return {
      status: "running" as const,
      runId: options.id,
      input: JSON.parse(
        String(existing?.input_json ?? JSON.stringify(options.input)),
      ) as any[],
    };
  });
}
export async function saveWork(
  client: Client,
  lease: RunLease,
  phase: "people" | "companies",
  keys: string[],
) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    for (const key of new Set(keys))
      await tx.execute({
        sql: "INSERT OR IGNORE INTO profile_work(run_id,phase,entity_key) VALUES (?,?,?)",
        args: [lease.id, phase, key],
      });
    if (phase === "companies")
      await tx.execute({
        sql: "UPDATE profile_runs SET companies_json = COALESCE(companies_json, ?) WHERE id = ?",
        args: [JSON.stringify(keys), lease.id],
      });
  });
}
export async function markWork(
  client: Client,
  lease: RunLease,
  phase: string,
  key: string,
  state: WorkState,
) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    await tx.execute({
      sql: "UPDATE profile_work SET state = ? WHERE run_id = ? AND phase = ? AND entity_key = ?",
      args: [state, lease.id, phase, key],
    });
  });
}
export async function reserve(
  client: Client,
  lease: RunLease,
  entityKey: string,
  operation: string,
  maximumUsd: number | null,
) {
  return transaction(client, async (tx) => {
    const run = await assertLease(tx, lease);
    const existing = (
      await tx.execute({
        sql: "SELECT * FROM profile_attempts WHERE entity_key = ? AND operation = ? AND (run_id = ? OR state IN ('reserved','dispatched','uncertain')) ORDER BY created_at DESC LIMIT 1",
        args: [entityKey, operation, lease.id],
      })
    ).rows[0];
    if (existing) return { status: "existing" as const, attempt: existing };
    if (maximumUsd === null) return { status: "unknown_price" as const };
    const amount = micros(maximumUsd);
    if (
      Number(run.spent_micro) + Number(run.reserved_micro) + amount >
      Number(run.budget_micro)
    )
      return { status: "budget_deferred" as const };
    // The run's own budget bounds one run; spend_usd_per_day bounds the workspace across runs.
    if (!(await spendFits(tx, amount + Number(run.reserved_micro))).fits)
      return { status: "budget_deferred" as const };
    const id = randomUUID();
    await tx.execute({
      sql: "INSERT INTO profile_attempts (id,run_id,entity_key,operation,state,reserved_micro,created_at) VALUES (?,?,?,?,'reserved',?,?)",
      args: [
        id,
        lease.id,
        entityKey,
        operation,
        amount,
        new Date().toISOString(),
      ],
    });
    await tx.execute({
      sql: "UPDATE profile_runs SET reserved_micro = reserved_micro + ? WHERE id = ?",
      args: [amount, lease.id],
    });
    return { status: "reserved" as const, id };
  });
}
/** Write before network dispatch. A crash after this point never authorizes another POST. */
export async function dispatch(client: Client, lease: RunLease, id: string) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    const changed = await tx.execute({
      sql: "UPDATE profile_attempts SET state = 'dispatched' WHERE id = ? AND run_id = ? AND state = 'reserved'",
      args: [id, lease.id],
    });
    return changed.rowsAffected === 1;
  });
}
export async function saveJob(client: Client, id: string, jobId: string) {
  await client.execute({
    sql: "UPDATE profile_attempts SET job_id = ? WHERE id = ? AND state IN ('dispatched','uncertain')",
    args: [jobId, id],
  });
}
export async function uncertain(client: Client, id: string) {
  await client.execute({
    sql: "UPDATE profile_attempts SET state = 'uncertain' WHERE id = ? AND state != 'settled'",
    args: [id],
  });
}
/** Response and accounting commit together; profile application can safely replay later. */
export async function settle(
  client: Client,
  id: string,
  costUsd: number | null,
  response: unknown,
) {
  return transaction(client, async (tx) => {
    const attempt = (
      await tx.execute({
        sql: "SELECT * FROM profile_attempts WHERE id = ?",
        args: [id],
      })
    ).rows[0];
    if (!attempt) throw new Error("Unknown attempt");
    if (attempt.state === "settled") return;
    if (costUsd === null) {
      await tx.execute({
        sql: "UPDATE profile_attempts SET state = 'uncertain', response_json = ? WHERE id = ?",
        args: [JSON.stringify(sanitize(response)), id],
      });
      return;
    }
    const cost = micros(costUsd);
    if (cost > Number(attempt.reserved_micro))
      throw new Error(
        "Provider charge exceeded verified maximum; stop and reconcile",
      );
    await tx.execute({
      sql: "UPDATE profile_attempts SET state = 'settled', cost_micro = ?, response_json = ? WHERE id = ?",
      args: [cost, JSON.stringify(sanitize(response)), id],
    });
    await tx.execute({
      sql: "UPDATE profile_runs SET spent_micro = spent_micro + ?, reserved_micro = reserved_micro - ? WHERE id = ?",
      args: [cost, attempt.reserved_micro, attempt.run_id],
    });
    await chargeSpendMicro(tx, cost);
  });
}
export async function cancelRun(client: Client, runId: string) {
  await client.execute({
    sql: "UPDATE profile_runs SET state = 'cancelled' WHERE (id = ? OR owner = ?) AND state = 'running'",
    args: [runId, runId],
  });
}
export async function runSummary(client: Client, runId: string) {
  const run = (
    await client.execute({
      sql: "SELECT * FROM profile_runs WHERE id = ?",
      args: [runId],
    })
  ).rows[0];
  if (!run) throw new Error("Unknown run");
  const work = (
    await client.execute({
      sql: "SELECT phase, state, COUNT(*) AS count FROM profile_work WHERE run_id = ? GROUP BY phase, state",
      args: [runId],
    })
  ).rows;
  return {
    runId,
    state: String(run.state),
    omitted: Number(run.omitted),
    spentUsd: Number(run.spent_micro) / 1e6,
    uncertainSpendUsd: Number(run.reserved_micro) / 1e6,
    outcomes: work.map((row) => ({
      phase: String(row.phase),
      state: String(row.state),
      count: Number(row.count),
    })),
  };
}
export async function finishRun(client: Client, lease: RunLease) {
  return transaction(client, async (tx) => {
    await assertLease(tx, lease);
    const pending = (
      await tx.execute({
        sql: "SELECT (SELECT COUNT(*) FROM profile_work WHERE run_id = ? AND state NOT IN ('done','reused')) + (SELECT reserved_micro FROM profile_runs WHERE id = ?) AS n",
        args: [lease.id, lease.id],
      })
    ).rows[0];
    await tx.execute({
      sql: "UPDATE profile_runs SET state = ? WHERE id = ?",
      args: [Number(pending.n) ? "partial" : "complete", lease.id],
    });
  });
}
