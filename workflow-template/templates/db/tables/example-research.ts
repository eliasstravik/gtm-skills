import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Every result table starts with key, updated_at, cost_usd, error; the workflow's own columns follow. */
export const exampleResearch = pgTable("example_research", {
  key: text("key").primaryKey(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  cost_usd: doublePrecision("cost_usd").notNull().default(0),
  error: text("error"),
  summary: text("summary"),
  sells: text("sells"),
  headcount_band: text("headcount_band"),
  evidence_json: jsonb("evidence_json"),
  tool_calls: integer("tool_calls"),
  stop_reason: text("stop_reason"),
});
