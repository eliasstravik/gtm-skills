import { sql } from "drizzle-orm";
import { bigint, integer, jsonb, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { gtm } from "./gtm";

const micro = (name: string) => bigint(name, { mode: "number" });

/** Paid-work ledger. Money is whole micro-dollars. */
export const profileRuns = gtm.table(
  "profile_runs",
  {
    id: text("id").primaryKey(),
    workflow_id: text("workflow_id").notNull(),
    owner: text("owner").notNull(),
    lease_until: timestamp("lease_until", { withTimezone: true }).notNull(),
    state: text("state").notNull(),
    budget_micro: micro("budget_micro").notNull(),
    spent_micro: micro("spent_micro").notNull().default(0),
    reserved_micro: micro("reserved_micro").notNull().default(0),
    input_json: jsonb("input_json").notNull(),
    companies_json: jsonb("companies_json"),
    omitted: integer("omitted").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // One running run per workspace: a unique index on a constant, limited to running rows.
  (t) => [uniqueIndex("profile_single_flight").on(sql`(1)`).where(sql`${t.state} = 'running'`)],
);

export const profileWork = gtm.table(
  "profile_work",
  {
    run_id: text("run_id").notNull(),
    phase: text("phase").notNull(),
    entity_key: text("entity_key").notNull(),
    state: text("state").notNull().default("pending"),
  },
  (t) => [primaryKey({ columns: [t.run_id, t.phase, t.entity_key] })],
);

export const profileAttempts = gtm.table(
  "profile_attempts",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull(),
    entity_key: text("entity_key").notNull(),
    operation: text("operation").notNull(),
    state: text("state").notNull(),
    reserved_micro: micro("reserved_micro").notNull(),
    cost_micro: micro("cost_micro"),
    job_id: text("job_id"),
    response_json: jsonb("response_json"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("profile_unsettled")
      .on(t.entity_key, t.operation)
      .where(sql`${t.state} IN ('reserved','dispatched','uncertain')`),
  ],
);

export const profileInputs = gtm.table(
  "profile_inputs",
  {
    workflow_id: text("workflow_id").notNull(),
    source_id: text("source_id").notNull(),
    row_id: text("row_id").notNull(),
    input_json: jsonb("input_json").notNull(),
    person_key: text("person_key"),
    first_observed_at: timestamp("first_observed_at", { withTimezone: true }).notNull(),
    last_observed_at: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.workflow_id, t.source_id, t.row_id] })],
);
