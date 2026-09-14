import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Every result table starts with key, updated_at, cost_usd, error; the workflow's own columns follow. */
export const exampleResearch = sqliteTable("example_research", {
  key: text("key").primaryKey(),
  updated_at: text("updated_at").notNull(),
  cost_usd: real("cost_usd").notNull().default(0),
  error: text("error"),
  summary: text("summary"),
  sells: text("sells"),
  headcount_band: text("headcount_band"),
  evidence_json: text("evidence_json"),
  tool_calls: integer("tool_calls"),
  stop_reason: text("stop_reason"),
});
