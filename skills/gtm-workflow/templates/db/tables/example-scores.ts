import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Every result table starts with key, updated_at, cost_usd, error; the workflow's own columns follow. */
export const exampleScores = sqliteTable("example_scores", {
  key: text("key").primaryKey(),
  updated_at: text("updated_at").notNull(),
  cost_usd: real("cost_usd").notNull().default(0),
  error: text("error"),
  score: integer("score"),
  reason: text("reason"),
});
