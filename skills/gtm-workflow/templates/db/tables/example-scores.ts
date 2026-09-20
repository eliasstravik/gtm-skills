import { doublePrecision, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Every result table starts with key, updated_at, cost_usd, error; the workflow's own columns follow. */
export const exampleScores = pgTable("example_scores", {
  key: text("key").primaryKey(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull(),
  cost_usd: doublePrecision("cost_usd").notNull().default(0),
  error: text("error"),
  score: integer("score"),
  reason: text("reason"),
});
