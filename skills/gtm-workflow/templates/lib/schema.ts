// gtm-lib v7
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type EnrichmentStatus = "cache_hit" | "success" | "empty" | "error";
export type WorkflowStatus =
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export const enrichmentCache = sqliteTable(
  "enrichment_cache",
  {
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    inputs: text("inputs").notNull(),
    raw: text("raw"),
    value: text("value").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.endpoint, table.inputsHash] }),
  ],
);

export const enrichmentRuns = sqliteTable(
  "enrichment_runs",
  {
    id: text("id").primaryKey(),
    runKey: text("run_key").notNull(),
    workflow: text("workflow").notNull(),
    provider: text("provider").notNull(),
    endpoint: text("endpoint").notNull(),
    inputsHash: text("inputs_hash").notNull(),
    status: text("status").$type<EnrichmentStatus>().notNull(),
    costUsd: real("cost_usd"),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("enrichment_runs_run_key_idx").on(table.runKey)],
);

export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
    runKey: text("run_key").primaryKey(),
    runId: text("run_id").unique(),
    workflow: text("workflow").notNull(),
    path: text("path").notNull(),
    method: text("method").$type<"GET" | "POST">().notNull(),
    input: text("input").notNull(),
    inputHash: text("input_hash").notNull(),
    status: text("status").$type<WorkflowStatus>().notNull(),
    error: text("error"),
    completed: integer("completed"),
    failed: integer("failed"),
    costUsd: real("cost_usd"),
    checkpoint: integer("checkpoint"),
    webhookUrl: text("webhook_url"),
    approval: text("approval"),
    startedAt: integer("started_at").notNull(),
    finishedAt: integer("finished_at"),
  },
  (table) => [
    uniqueIndex("workflow_runs_live_idx")
      .on(table.path, table.inputHash)
      .where(sql`finished_at IS NULL`),
  ],
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof workflowRuns.$inferInsert;
